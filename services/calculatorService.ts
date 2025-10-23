import type { CalculationResult, AmortizationData } from '../types';

const DRAW_PERIOD_YEARS = 2;

export const calculateAmortization = (
  drawSchedule: number[],
  initialDrawAmount: number,
  annualRate: number,
  termInYears: number,
  originationFeePercent: number,
  annualFee: number,
  drawFee: number,
  inactivityFee: number,
  monthlyMaintenanceFee: number,
  borrowLimit: number,
  repaymentCadence: 'monthly' | 'weekly',
  paymentPolicy: 'interestOnly' | 'percentOfBalance' | 'interestPlusPrincipalFloor',
  balancePaymentPercent: number,
  principalFloorAmount: number,
  rateChanges: { period: number; newTotalAPR: number }[],
  interestCalculationMethod: 'endOfPeriod' | 'adb'
): CalculationResult => {
  if (annualRate < 0 || termInYears <= 0) {
    return {
      principalAndInterestPayment: 0,
      peakBalance: 0,
      totalInterest: 0,
      totalPayment: 0,
      totalFees: 0,
      effectiveAPR: 0,
      schedule: [],
    };
  }
  
  const sortedRateChanges = [...rateChanges].sort((a, b) => a.period - b.period);

  const periodsPerYear = repaymentCadence === 'monthly' ? 12 : 52;
  const drawPeriods = DRAW_PERIOD_YEARS * periodsPerYear;
  const periodsPerMonth = periodsPerYear / 12;

  const schedule: AmortizationData[] = [];
  let remainingBalance = 0;
  let totalInterest = 0;
  let totalDraws = 0;
  let totalFees = 0;
  let peakBalance = 0;
  
  // Handle initial draw before period 1
  if (initialDrawAmount > 0) {
      const actualInitialDraw = Math.max(0, Math.min(initialDrawAmount, borrowLimit));
      remainingBalance += actualInitialDraw;
      totalDraws += actualInitialDraw;
      
      const percentageFee = actualInitialDraw * (originationFeePercent / 100);
      totalFees += percentageFee;
      totalFees += drawFee;
  }

  peakBalance = remainingBalance;
  
  let currentAnnualRate = annualRate;

  // --- Draw Period ---
  for (let i = 1; i <= drawPeriods; i++) {
    const beginningBalance = remainingBalance;
    let feesThisPeriod = 0;

    // Check for rate change at the start of the period
    const rateChange = sortedRateChanges.find(rc => rc.period === i);
    if (rateChange) {
        currentAnnualRate = rateChange.newTotalAPR;
    }

    // Apply periodic fees for this period
    if ((i - 1) % periodsPerMonth === 0) { // First period of a month
        feesThisPeriod += monthlyMaintenanceFee;
    }
    if ((i - 1) % periodsPerYear === 0) { // First period of a year
        feesThisPeriod += annualFee;
    }

    let actualDraw = 0;
    
    // Distribute monthly draw to the first period of the month
    const currentMonthIndex = Math.floor((i - 1) / periodsPerMonth);
    if ((i - 1) % periodsPerMonth === 0 && currentMonthIndex < drawSchedule.length) {
        const requestedDraw = drawSchedule[currentMonthIndex] || 0;
        const availableCredit = borrowLimit - remainingBalance;
        actualDraw = Math.max(0, Math.min(requestedDraw, availableCredit));
    }

    // Apply draw-related fees
    if (actualDraw > 0) {
        const percentageFee = actualDraw * (originationFeePercent / 100);
        feesThisPeriod += percentageFee;
        feesThisPeriod += drawFee;
    } else {
        // Only apply inactivity fee if there was no initial draw on period 1 AND no scheduled draw
        if(i > 1 || initialDrawAmount === 0) {
           feesThisPeriod += inactivityFee;
        }
    }
    
    totalFees += feesThisPeriod;
    remainingBalance += actualDraw;
    totalDraws += actualDraw;

    if (remainingBalance > peakBalance) {
      peakBalance = remainingBalance;
    }

    let interest = 0;
    if (interestCalculationMethod === 'adb') {
        const daysInPeriod = repaymentCadence === 'monthly' ? 365.25 / 12 : 7;
        const dailyRate = currentAnnualRate / 100 / 365.25;
        interest = remainingBalance * dailyRate * daysInPeriod;
    } else { // endOfPeriod
        const periodicRate = currentAnnualRate / 100 / periodsPerYear;
        interest = remainingBalance * periodicRate;
    }

    totalInterest += interest;
    
    let payment = 0;
    let principalPaid = 0;

    if (paymentPolicy === 'percentOfBalance') {
        const percentBasedPayment = remainingBalance * (balancePaymentPercent / 100);
        payment = Math.max(interest, percentBasedPayment); // Payment must at least cover interest
        principalPaid = payment - interest;
    } else if (paymentPolicy === 'interestPlusPrincipalFloor') {
        principalPaid = principalFloorAmount;
        payment = interest + principalFloorAmount;
    }
    else { // interestOnly
        payment = interest;
        principalPaid = 0;
    }
    
    // Ensure principal payment doesn't overpay the loan
    if (principalPaid > remainingBalance) {
        principalPaid = remainingBalance;
        payment = principalPaid + interest;
    }
    
    remainingBalance -= principalPaid;
    
    const totalPaymentThisPeriod = payment + feesThisPeriod;
    const availableCredit = borrowLimit - remainingBalance;

    schedule.push({
      period: i,
      beginningBalance,
      drawAmount: actualDraw,
      payment,
      interest,
      principal: principalPaid,
      feesThisPeriod,
      totalPaymentThisPeriod,
      remainingBalance,
      availableCredit,
    });
  }

  // --- Repayment Period ---
  const repaymentPrincipal = remainingBalance;
  let principalAndInterestPayment = 0;

  if (repaymentPrincipal > 0) {
      const remainingTermInPeriods = termInYears * periodsPerYear;
      let repaymentPeriodicRate = currentAnnualRate / 100 / periodsPerYear;
      
      principalAndInterestPayment =
        remainingTermInPeriods > 0 && repaymentPeriodicRate > 0
          ? (repaymentPrincipal * repaymentPeriodicRate * Math.pow(1 + repaymentPeriodicRate, remainingTermInPeriods)) /
            (Math.pow(1 + repaymentPeriodicRate, remainingTermInPeriods) - 1)
          : (remainingTermInPeriods > 0 ? repaymentPrincipal / remainingTermInPeriods : 0);
      
      for (let i = 1; i <= remainingTermInPeriods; i++) {
          const currentOverallPeriod = drawPeriods + i;
          const beginningBalance = remainingBalance;
          let feesThisPeriod = 0;

          // Check for rate change at the START of the period & re-amortize if needed
          const rateChange = sortedRateChanges.find(rc => rc.period === currentOverallPeriod);
          if (rateChange) {
              currentAnnualRate = rateChange.newTotalAPR;
              repaymentPeriodicRate = currentAnnualRate / 100 / periodsPerYear;
              const periodsLeftInRepayment = remainingTermInPeriods - (i - 1);
              
              if (remainingBalance > 0 && periodsLeftInRepayment > 0) {
                   principalAndInterestPayment =
                    repaymentPeriodicRate > 0
                      ? (remainingBalance * repaymentPeriodicRate * Math.pow(1 + repaymentPeriodicRate, periodsLeftInRepayment)) /
                        (Math.pow(1 + repaymentPeriodicRate, periodsLeftInRepayment) - 1)
                      : remainingBalance / periodsLeftInRepayment;
              }
          }

          // Apply periodic fees
          if ((currentOverallPeriod - 1) % periodsPerMonth === 0) {
              feesThisPeriod += monthlyMaintenanceFee;
          }
          if ((currentOverallPeriod - 1) % periodsPerYear === 0) {
              feesThisPeriod += annualFee;
          }
          totalFees += feesThisPeriod;

          let interest = 0;
            if (interestCalculationMethod === 'adb') {
                const daysInPeriod = repaymentCadence === 'monthly' ? 365.25 / 12 : 7;
                const dailyRate = currentAnnualRate / 100 / 365.25;
                interest = remainingBalance * dailyRate * daysInPeriod;
            } else { // endOfPeriod
                interest = remainingBalance * repaymentPeriodicRate;
            }
          
          totalInterest += interest;
          
          let principalPaid = principalAndInterestPayment - interest;
          
          if (remainingBalance - principalPaid < 0) {
              principalPaid = remainingBalance;
          }

          remainingBalance -= principalPaid;
          
          const totalPaymentThisPeriod = principalAndInterestPayment + feesThisPeriod;
          const availableCredit = borrowLimit - remainingBalance;

          schedule.push({
              period: drawPeriods + i,
              beginningBalance,
              drawAmount: 0,
              payment: principalAndInterestPayment,
              interest,
              principal: principalPaid,
              feesThisPeriod,
              totalPaymentThisPeriod,
              remainingBalance: remainingBalance < 0 ? 0 : remainingBalance,
              availableCredit,
          });
      }
  }

  const totalPayment = totalDraws + totalInterest + totalFees;
  const totalLoanDurationYears = schedule.length / periodsPerYear;
  
  const effectiveAPR = totalDraws > 0 && totalLoanDurationYears > 0 
    ? ((totalInterest + totalFees) / totalDraws / totalLoanDurationYears) * 100 
    : 0;
  
  return { 
      principalAndInterestPayment,
      peakBalance,
      totalInterest, 
      totalPayment,
      totalFees,
      effectiveAPR,
      schedule 
    };
};
