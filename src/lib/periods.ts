import { supabase } from './supabase';

interface Period {
  id: string;
  fiscal_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'locked' | 'closed';
  locked_by: string | null;
  locked_at: string | null;
}

interface PostingRules {
  allow_posting_to_closed: boolean;
  allow_backdating_days: number;
  require_narration: boolean;
  enable_eod_lock: boolean;
}

// Cache for periods (module-level)
let periodsCache: Period[] | null = null;
let postingRulesCache: PostingRules | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all accounting periods (cached)
 */
export const getAllPeriods = async (forceRefresh = false): Promise<Period[]> => {
  const now = Date.now();
  
  if (forceRefresh || !periodsCache || (now - cacheTimestamp) > CACHE_TTL) {
    try {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .order('start_date', { ascending: true });
      
      if (error) throw error;
      periodsCache = data || [];
      cacheTimestamp = now;
    } catch (err) {
      console.error('Failed to load periods:', err);
      periodsCache = [];
    }
  }
  
  return periodsCache;
};

/**
 * Get posting rules (cached)
 */
export const getPostingRules = async (forceRefresh = false): Promise<PostingRules | null> => {
  const now = Date.now();
  
  if (forceRefresh || !postingRulesCache || (now - cacheTimestamp) > CACHE_TTL) {
    try {
      const { data, error } = await supabase
        .from('posting_rules')
        .select('*')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      postingRulesCache = data || null;
      cacheTimestamp = now;
    } catch (err) {
      console.error('Failed to load posting rules:', err);
      postingRulesCache = null;
    }
  }
  
  return postingRulesCache;
};

/**
 * Get the period that a date falls into
 * Returns null if date is outside all periods
 */
export const getPeriodForDate = async (date: Date | string): Promise<Period | null> => {
  const periods = await getAllPeriods();
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  
  const period = periods.find((p) => {
    const startDate = new Date(p.start_date);
    const endDate = new Date(p.end_date);
    return checkDate >= startDate && checkDate <= endDate;
  });
  
  return period || null;
};

/**
 * Check if a period is open for posting
 * Returns { allowed: boolean, message: string }
 */
export const isPeriodOpen = async (date: Date | string): Promise<{ allowed: boolean; message: string }> => {
  const period = await getPeriodForDate(date);
  
  if (!period) {
    return {
      allowed: false,
      message: 'Date falls outside all defined accounting periods'
    };
  }
  
  if (period.status === 'open') {
    return {
      allowed: true,
      message: `Period "${period.name}" is open`
    };
  }
  
  if (period.status === 'locked') {
    return {
      allowed: false,
      message: `Period "${period.name}" is locked. Unlock it in Accounting Settings to post to this period.`
    };
  }
  
  if (period.status === 'closed') {
    return {
      allowed: false,
      message: `Period "${period.name}" is closed. Cannot post to closed periods.`
    };
  }
  
  return {
    allowed: false,
    message: `Period "${period.name}" has invalid status: ${period.status}`
  };
};

/**
 * Get the current period (the one today falls into)
 * Returns null if today is outside all periods
 */
export const getCurrentPeriod = async (): Promise<Period | null> => {
  return getPeriodForDate(new Date());
};

/**
 * Check if a date is too old for posting (based on posting rules)
 * Returns { allowed: boolean, message: string, days_old: number }
 */
export const isBackdatingAllowed = async (date: Date | string): Promise<{
  allowed: boolean;
  message: string;
  days_old: number;
}> => {
  const rules = await getPostingRules();
  if (!rules) {
    return {
      allowed: true,
      message: 'No posting rules configured',
      days_old: 0
    };
  }
  
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const daysOld = Math.floor((today.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysOld > rules.allow_backdating_days) {
    return {
      allowed: false,
      message: `Cannot post more than ${rules.allow_backdating_days} days in the past. This entry is ${daysOld} days old.`,
      days_old: daysOld
    };
  }
  
  return {
    allowed: true,
    message: `Date is within ${rules.allow_backdating_days}-day limit`,
    days_old: daysOld
  };
};

/**
 * Validate a posting date against all rules
 * Returns { allowed: boolean; errors: string[] }
 * This is the main validation function to call from voucher posting
 */
export const validatePostingDate = async (date: Date | string, userIsAdmin: boolean): Promise<{
  allowed: boolean;
  errors: string[];
}> => {
  const errors: string[] = [];
  
  // Check period status
  const periodCheck = await isPeriodOpen(date);
  if (!periodCheck.allowed && !userIsAdmin) {
    errors.push(periodCheck.message);
  }
  
  // Check backdating rule
  const backdateCheck = await isBackdatingAllowed(date);
  if (!backdateCheck.allowed && !userIsAdmin) {
    errors.push(backdateCheck.message);
  }
  
  return {
    allowed: errors.length === 0,
    errors
  };
};

/**
 * Clear the cache (useful after settings changes)
 */
export const clearPeriodsCache = () => {
  periodsCache = null;
  postingRulesCache = null;
  cacheTimestamp = 0;
};

/**
 * Format a period name for display
 * e.g. "March 2026" -> "MAR-2026"
 */
export const formatPeriodName = (periodName: string): string => {
  const match = periodName.match(/(\w+)\s(\d{4})/);
  if (match) {
    const month = match[1].substring(0, 3).toUpperCase();
    const year = match[2];
    return `${month}-${year}`;
  }
  return periodName;
};
