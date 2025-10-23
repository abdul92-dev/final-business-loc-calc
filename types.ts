export interface AmortizationData {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  remainingBalance: number;
  drawAmount: number;
  // New fields
  beginningBalance: number;
  availableCredit: number;
  feesThisPeriod: number;
  totalPaymentThisPeriod: number;
}

export interface CalculationResult {
  principalAndInterestPayment: number;
  peakBalance: number;
  totalInterest: number;
  totalPayment: number;
  totalFees: number;
  effectiveAPR: number;
  schedule: AmortizationData[];
}