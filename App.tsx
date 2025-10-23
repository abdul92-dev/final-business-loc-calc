import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Bar, ComposedChart, ReferenceLine, Brush } from 'recharts';
import type { CalculationResult, AmortizationData } from './types';
import { calculateAmortization } from './services/calculatorService';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
}

// --- Reusable Icon Components ---

const InfoIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block text-slate-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

const TrashIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
);


// --- UI Components ---

interface SliderInputProps {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

const SliderInput: React.FC<SliderInputProps> = React.memo(({ label, tooltip, value, min, max, step, unit, onChange }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <span className="group relative ml-2">
        <InfoIcon />
        <span className="absolute bottom-full mb-2 w-64 hidden group-hover:block bg-slate-700 text-white text-xs rounded-lg py-2 px-3 z-10">
          {tooltip}
        </span>
      </span>
    </label>
    <div className="flex items-center space-x-4">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-32 px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 text-sm"
      />
       <span className="text-sm text-slate-500 w-10 text-right">{unit}</span>
    </div>
  </div>
));

interface RadioGroupProps<T extends string> {
    label: string;
    tooltip?: string;
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
}

const RadioGroup = <T extends string>({ label, tooltip, value, onChange, options }: RadioGroupProps<T>) => (
    <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
            {label}
            {tooltip && (
                 <span className="group relative ml-2">
                    <InfoIcon />
                    <span className="absolute bottom-full mb-2 w-72 hidden group-hover:block bg-slate-700 text-white text-xs rounded-lg py-2 px-3 z-10">
                    {tooltip}
                    </span>
                </span>
            )}
        </label>
        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-md">
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`w-full px-3 py-1 text-sm font-medium rounded-md transition-colors ${value === option.value ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    </div>
);


const DRAW_MONTHS = 36;
const DRAW_PERIOD_MONTHS = 24;

interface DrawScheduleGridProps {
    schedule: number[];
    setSchedule: (schedule: number[]) => void;
    borrowLimit: number;
}

const DrawScheduleGrid: React.FC<DrawScheduleGridProps> = ({ schedule, setSchedule, borrowLimit }) => {
    
    const applyPreset = (pattern: 'seasonal' | 'inventory' | 'payroll' | 'adhoc') => {
        const newSchedule = Array(DRAW_MONTHS).fill(0);
        switch(pattern) {
            case 'inventory':
                newSchedule[0] = Math.min(50000, borrowLimit);
                break;
            case 'seasonal':
                // Summer peak
                newSchedule[4] = Math.min(15000, borrowLimit);
                newSchedule[5] = Math.min(25000, borrowLimit);
                newSchedule[6] = Math.min(15000, borrowLimit);
                // Holiday peak
                newSchedule[10] = Math.min(20000, borrowLimit);
                newSchedule[11] = Math.min(30000, borrowLimit);
                break;
            case 'payroll':
                for (let i = 0; i < DRAW_PERIOD_MONTHS; i++) {
                    if (i % 2 === 1) { // every other month to simulate bi-weekly
                       newSchedule[i] = Math.min(10000, borrowLimit);
                    }
                }
                break;
            case 'adhoc':
            default:
                // All zeros, already done
                break;
        }
        setSchedule(newSchedule);
    };

    const handleDrawChange = (index: number, value: string) => {
        const newAmount = parseInt(value, 10) || 0;
        const newSchedule = [...schedule];
        newSchedule[index] = newAmount;
        setSchedule(newSchedule);
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 pt-4">Monthly Draw Schedule (First 24 Months)</h3>
            <div className="flex flex-wrap gap-2">
                <button onClick={() => applyPreset('adhoc')} className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">Ad-hoc</button>
                <button onClick={() => applyPreset('inventory')} className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">Upfront Inventory</button>
                <button onClick={() => applyPreset('seasonal')} className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">Seasonal Business</button>
                <button onClick={() => applyPreset('payroll')} className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">Payroll Bridge</button>
            </div>
            <div className="max-h-60 overflow-auto border border-slate-200 rounded-md p-2 bg-slate-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {Array.from({ length: DRAW_MONTHS }).map((_, i) => (
                        <div key={i} className={`flex items-center space-x-2 p-1 rounded ${ i % 2 === 0 ? 'bg-white' : ''}`}>
                             <label className="w-16 text-slate-500">Month {i + 1}:</label>
                             <input 
                                type="number" 
                                value={schedule[i]}
                                onChange={(e) => handleDrawChange(i, e.target.value)}
                                className="w-full px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-brand-500 focus:border-brand-500"
                                disabled={i >= DRAW_PERIOD_MONTHS}
                                placeholder="$"
                             />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- New Rate Changes Component ---
interface RateChangesEditorProps {
    rateChanges: RateChange[];
    setScenario: (updates: Partial<ScenarioInputs>) => void;
    repaymentCadence: 'monthly' | 'weekly';
}

const RateChangesEditor: React.FC<RateChangesEditorProps> = ({ rateChanges, setScenario, repaymentCadence }) => {
    const periodLabel = repaymentCadence === 'monthly' ? 'Month' : 'Week';

    const addRateChange = () => {
        const lastPeriod = rateChanges.length > 0 ? rateChanges[rateChanges.length - 1].period : 0;
        const newRateChange = { period: lastPeriod + 6, newTotalAPR: 8.0 };
        setScenario({ rateChanges: [...rateChanges, newRateChange] });
    };

    const updateRateChange = (index: number, field: keyof RateChange, value: number) => {
        const newRateChanges = [...rateChanges];
        newRateChanges[index] = { ...newRateChanges[index], [field]: value };
        setScenario({ rateChanges: newRateChanges });
    };

    const removeRateChange = (index: number) => {
        const newRateChanges = rateChanges.filter((_, i) => i !== index);
        setScenario({ rateChanges: newRateChanges });
    };

    return (
        <div className="space-y-3">
             <label className="block text-sm font-medium text-slate-700">
                Rate Changes
                <span className="group relative ml-2">
                    <InfoIcon />
                    <span className="absolute bottom-full mb-2 w-64 hidden group-hover:block bg-slate-700 text-white text-xs rounded-lg py-2 px-3 z-10">
                        Model how your payments change if the Total APR changes at specific points in the loan term. The calculator will automatically re-amortize the loan from that point.
                    </span>
                </span>
            </label>
            {rateChanges.map((rc, index) => (
                <div key={index} className="flex items-center space-x-2 p-2 bg-slate-50 rounded-md">
                    <label className="text-sm text-slate-600">At {periodLabel}:</label>
                    <input
                        type="number"
                        min={1}
                        value={rc.period}
                        onChange={(e) => updateRateChange(index, 'period', parseInt(e.target.value, 10) || 1)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-brand-500 focus:border-brand-500 text-sm"
                    />
                    <label className="text-sm text-slate-600">New APR:</label>
                    <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={rc.newTotalAPR}
                        onChange={(e) => updateRateChange(index, 'newTotalAPR', parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-brand-500 focus:border-brand-500 text-sm"
                    />
                    <span>%</span>
                    <button onClick={() => removeRateChange(index)} className="text-slate-400 hover:text-red-500 p-1">
                        <TrashIcon />
                    </button>
                </div>
            ))}
            <button
                onClick={addRateChange}
                className="w-full px-3 py-1 text-sm font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-500 transition-colors"
            >
                + Add Rate Change
            </button>
        </div>
    );
};


interface CalculatorFormProps {
    scenario: ScenarioInputs;
    setScenario: (updates: Partial<ScenarioInputs>) => void;
    activeScenario: 'A' | 'B';
    setActiveScenario: (scenario: 'A' | 'B') => void;
    scenarioA: ScenarioInputs;
    scenarioB: ScenarioInputs;
    onCopyToB: () => void;
    onReset: () => void;
    isComparing: boolean;
    onEnableComparison: () => void;
    onRemoveComparison: () => void;
}

const CalculatorForm: React.FC<CalculatorFormProps> = ({
    scenario, setScenario, activeScenario, setActiveScenario, scenarioA, scenarioB, onCopyToB, onReset,
    isComparing, onEnableComparison, onRemoveComparison
}) => {
    const totalAPR = useMemo(() => scenario.primeRate + scenario.margin, [scenario.primeRate, scenario.margin]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <h1 className="text-3xl font-bold text-slate-800 mb-4 text-center">Business Line of Credit Calculator</h1>
            
            <div className="my-6 space-y-4">
                {isComparing ? (
                    <>
                        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-md">
                            <button
                                type="button"
                                onClick={() => setActiveScenario('A')}
                                className={`w-full px-3 py-2 text-base font-bold rounded-md transition-colors truncate ${activeScenario === 'A' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}
                                title={scenarioA.name}
                            >
                                {scenarioA.name}
                            </button>
                             <button
                                type="button"
                                onClick={() => setActiveScenario('B')}
                                className={`w-full px-3 py-2 text-base font-bold rounded-md transition-colors truncate ${activeScenario === 'B' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600 hover:bg-white/60'}`}
                                title={scenarioB.name}
                            >
                                {scenarioB.name}
                            </button>
                        </div>
                         <div className="text-center">
                            <button onClick={onRemoveComparison} className="text-sm text-slate-500 hover:text-slate-700 font-semibold">
                                Remove Comparison
                            </button>
                            {activeScenario === 'B' && (
                                <>
                                <span className="mx-2 text-slate-300">|</span>
                                <button onClick={onCopyToB} className="text-sm text-brand-600 hover:text-brand-800 font-semibold">
                                    Copy "{scenarioA.name}" to "{scenarioB.name}"
                                </button>
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="text-center">
                        <button
                            onClick={onEnableComparison}
                            className="w-full px-4 py-2 text-base font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-colors"
                        >
                            + Add Scenario for Comparison
                        </button>
                    </div>
                )}
                 <div>
                    <label htmlFor="scenarioName" className="block text-sm font-medium text-slate-700">
                        Scenario Name
                    </label>
                    <input
                        type="text"
                        id="scenarioName"
                        value={scenario.name}
                        onChange={(e) => setScenario({ name: e.target.value })}
                        className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500 text-sm"
                    />
                </div>
            </div>
            
            <div className="space-y-6">
                <h2 className="text-xl font-bold text-slate-800 border-b pb-2">Credit Line Details</h2>
                <SliderInput
                    label="Borrowing Limit"
                    tooltip="The maximum amount you can borrow under your line of credit."
                    value={scenario.borrowLimit}
                    onChange={v => setScenario({ borrowLimit: v })}
                    min={10000}
                    max={500000}
                    step={1000}
                    unit="$"
                />
                 <SliderInput
                    label="Initial Draw Amount"
                    tooltip="A one-time amount drawn at the very beginning of the loan term (Period 0), before any scheduled monthly draws."
                    value={scenario.initialDrawAmount}
                    onChange={v => setScenario({ initialDrawAmount: v })}
                    min={0}
                    max={scenario.borrowLimit}
                    step={1000}
                    unit="$"
                />
                
                <DrawScheduleGrid 
                    schedule={scenario.drawSchedule} 
                    setSchedule={v => setScenario({ drawSchedule: v })} 
                    borrowLimit={scenario.borrowLimit}
                />

                <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 pt-4">Interest Rate</h3>
                 <SliderInput
                    label="Prime Rate"
                    tooltip="The underlying benchmark rate, often based on the Wall Street Journal Prime Rate."
                    value={scenario.primeRate}
                    onChange={v => setScenario({ primeRate: v })}
                    min={0}
                    max={15}
                    step={0.25}
                    unit="%"
                />
                 <SliderInput
                    label="Margin"
                    tooltip="The percentage points added to the prime rate to determine your total interest rate."
                    value={scenario.margin}
                    onChange={v => setScenario({ margin: v })}
                    min={0}
                    max={15}
                    step={0.1}
                    unit="%"
                />
                <div className="bg-slate-100 p-3 rounded-md flex justify-between items-center text-sm">
                    <span className="font-medium text-slate-600">Initial Total APR</span>
                    <span className="font-bold text-brand-700">{formatPercent(totalAPR)}</span>
                </div>
                
                <RateChangesEditor 
                    rateChanges={scenario.rateChanges}
                    setScenario={setScenario}
                    repaymentCadence={scenario.repaymentCadence}
                />

                <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 pt-4">Fees & Terms</h3>
                <SliderInput
                    label="Draw Fee (%)"
                    tooltip="An upfront fee charged by the lender for each draw, expressed as a percentage of the draw amount."
                    value={scenario.originationFee}
                    onChange={v => setScenario({ originationFee: v })}
                    min={0}
                    max={5}
                    step={0.1}
                    unit="%"
                />
                 <SliderInput
                    label="Per-Draw Fee ($)"
                    tooltip="A flat fee charged by the lender for each individual draw made on the line of credit."
                    value={scenario.drawFee}
                    onChange={v => setScenario({ drawFee: v })}
                    min={0}
                    max={100}
                    step={5}
                    unit="$"
                />
                <SliderInput
                    label="Annual Fee ($)"
                    tooltip="A flat fee charged annually by the lender to keep the line of credit open. Applied throughout the entire loan term."
                    value={scenario.annualFee}
                    onChange={v => setScenario({ annualFee: v })}
                    min={0}
                    max={500}
                    step={10}
                    unit="$"
                />
                <SliderInput
                    label="Monthly Maintenance Fee ($)"
                    tooltip="A recurring fee charged by the lender to service the account. Applied throughout the entire loan term."
                    value={scenario.monthlyMaintenanceFee}
                    onChange={v => setScenario({ monthlyMaintenanceFee: v })}
                    min={0}
                    max={100}
                    step={5}
                    unit="$"
                />
                <SliderInput
                    label="Inactivity Fee ($)"
                    tooltip="A fee charged for any period (month/week) during the draw period where no draw is made."
                    value={scenario.inactivityFee}
                    onChange={v => setScenario({ inactivityFee: v })}
                    min={0}
                    max={100}
                    step={5}
                    unit="$"
                />
                 <SliderInput
                    label="Repayment Term (Post-Draw)"
                    tooltip="The period over which the final balance will be paid back after the 24-month draw period ends."
                    value={scenario.repaymentTerm}
                    onChange={v => setScenario({ repaymentTerm: v })}
                    min={1}
                    max={10}
                    step={1}
                    unit="Yrs"
                />

                <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 pt-4">Repayment Strategy</h3>
                 <RadioGroup
                    label="Repayment Cadence"
                    value={scenario.repaymentCadence}
                    onChange={v => setScenario({ repaymentCadence: v })}
                    options={[{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }]}
                />
                <RadioGroup
                    label="Interest Calculation Method"
                    tooltip="'End-of-Period' calculates interest on the final balance of the period. 'Average Daily Balance' calculates interest on the average balance held throughout the period, which is more precise."
                    value={scenario.interestCalculationMethod}
                    onChange={v => setScenario({ interestCalculationMethod: v })}
                    options={[
                        { value: 'endOfPeriod', label: 'End-of-Period' },
                        { value: 'adb', label: 'Average Daily Balance' }
                    ]}
                />
                 <RadioGroup
                    label="Payment Policy (During Draw Period)"
                    value={scenario.paymentPolicy}
                    onChange={v => setScenario({ paymentPolicy: v })}
                    options={[
                        { value: 'interestOnly', label: 'Interest Only' },
                        { value: 'percentOfBalance', label: '% of Balance' },
                        { value: 'interestPlusPrincipalFloor', label: 'Interest + Principal Floor' }
                    ]}
                />
                {scenario.paymentPolicy === 'percentOfBalance' && (
                     <SliderInput
                        label="Payment % of Balance"
                        tooltip="The percentage of the outstanding balance to be paid each period. Must at least cover interest."
                        value={scenario.balancePaymentPercent}
                        onChange={v => setScenario({ balancePaymentPercent: v })}
                        min={1}
                        max={3}
                        step={0.1}
                        unit="%"
                    />
                )}
                 {scenario.paymentPolicy === 'interestPlusPrincipalFloor' && (
                     <SliderInput
                        label="Principal Floor ($)"
                        tooltip="A fixed principal amount to be paid each period in addition to the interest due."
                        value={scenario.principalFloorAmount}
                        onChange={v => setScenario({ principalFloorAmount: v })}
                        min={0}
                        max={5000}
                        step={50}
                        unit="$"
                    />
                )}
            </div>
             <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-end space-x-4">
                <button
                    type="button"
                    onClick={onReset}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-colors"
                >
                    Reset "{scenario.name}"
                </button>
            </div>
        </div>
    );
};


interface ResultsDisplayProps {
    result: CalculationResult;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result }) => (
    <div className="bg-white p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-6">Payment Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-center">
            <div>
                <p className="text-sm text-slate-500">Peak Balance</p>
                <p className="text-2xl font-bold text-brand-600">{formatCurrency(result.peakBalance)}</p>
            </div>
             <div>
                <p className="text-sm text-slate-500">Term Payment</p>
                <p className="text-2xl font-bold text-slate-700">{formatCurrency(result.principalAndInterestPayment)}</p>
                <p className="text-xs text-slate-500 mt-1">After draw period</p>
            </div>
             <div>
                <p className="text-sm text-slate-500">Effective APR</p>
                <p className="text-2xl font-bold text-slate-700">{formatPercent(result.effectiveAPR)}</p>
            </div>
            <div>
                <p className="text-sm text-slate-500">Total Interest Paid</p>
                <p className="text-2xl font-bold text-slate-700">{formatCurrency(result.totalInterest)}</p>
            </div>
            <div>
                <p className="text-sm text-slate-500">Total Fees Paid</p>
                <p className="text-2xl font-bold text-slate-700">{formatCurrency(result.totalFees)}</p>
            </div>
            <div>
                <p className="text-sm text-slate-500">Total Repayment</p>
                <p className="text-2xl font-bold text-slate-700">{formatCurrency(result.totalPayment)}</p>
            </div>
        </div>
    </div>
);


const CustomTooltip = ({ active, payload, label, cadence }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as AmortizationData;
      const periodLabel = cadence === 'monthly' ? 'Month' : 'Week';
  
      return (
        <div className="p-3 bg-white border border-slate-300 rounded-lg shadow-lg text-sm z-50">
          <p className="font-bold text-slate-800 mb-2">{`${periodLabel} ${label}`}</p>
          <div className="space-y-1">
            <p className="text-slate-600 flex justify-between">
                <span className="font-medium mr-4">Balance:</span> 
                <span>{formatCurrency(data.remainingBalance)}</span>
            </p>
            <p className="text-slate-600 flex justify-between">
                <span className="font-medium mr-4">Principal Paid:</span>
                <span>{formatCurrency(data.principal)}</span>
            </p>
            <p className="text-slate-600 flex justify-between">
                <span className="font-medium mr-4">Interest Paid:</span>
                <span>{formatCurrency(data.interest)}</span>
            </p>
            {data.drawAmount > 0 && (
               <p className="text-sky-700 flex justify-between">
                   <span className="font-medium mr-4">Draw:</span>
                   <span>{formatCurrency(data.drawAmount)}</span>
                </p>
            )}
          </div>
        </div>
      );
    }
  
    return null;
  };

interface AmortizationChartProps {
    data: AmortizationData[];
    cadence: 'monthly' | 'weekly';
}

const AmortizationChart: React.FC<AmortizationChartProps> = ({ data, cadence }) => {
    const drawPeriodPeriods = cadence === 'monthly' ? 24 : 104;
    const periodLabel = cadence === 'monthly' ? 'Month' : 'Week';

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold text-slate-800 border-b pb-2 mb-4">Balance Over Time</h2>
            <div className="w-full h-96">
                <ResponsiveContainer>
                    <ComposedChart data={data} margin={{ top: 5, right: 20, left: 30, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" label={{ value: periodLabel, position: 'insideBottom', offset: -15 }} />
                        <YAxis tickFormatter={(tick) => formatCurrency(tick)} />
                        <Tooltip content={<CustomTooltip cadence={cadence} />} cursor={{ strokeDasharray: '3 3' }} />
                        <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '20px' }}/>
                        <Bar dataKey="drawAmount" barSize={20} fill="#38bdf8" name="Draw" />
                        <Area type="monotone" dataKey="remainingBalance" stroke="#10b981" fill="#6ee7b7" name="Remaining Balance" />
                        <ReferenceLine x={drawPeriodPeriods} stroke="red" strokeDasharray="3 3" label={{ value: 'Draw Period Ends', position: 'insideTopLeft' }} />
                        <Brush dataKey="period" height={30} stroke="#0284c7" travellerWidth={20} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

interface AmortizationTableProps {
    data: AmortizationData[];
    cadence: 'monthly' | 'weekly';
}

const AmortizationTable: React.FC<AmortizationTableProps> = ({ data, cadence }) => {
    const [showAll, setShowAll] = useState(false);
    const displayedData = showAll ? data : data.slice(0, 12);
    const periodLabel = cadence === 'monthly' ? 'Month' : 'Week';
    const drawPeriodPeriods = cadence === 'monthly' ? 24 : 104;

    const handleExportCSV = useCallback(() => {
        if (!data || data.length === 0) return;

        const periodHeader = cadence === 'monthly' ? 'Month' : 'Week';
        const headers = [
            periodHeader, 
            'Beginning Balance',
            'Draw', 
            'Total Payment', 
            'Principal', 
            'Interest', 
            'Fees',
            'Ending Balance',
            'Available Credit'
        ];
        
        const csvContent = [
            headers.join(','),
            ...data.map(row => [
                row.period,
                row.beginningBalance.toFixed(2),
                row.drawAmount.toFixed(2),
                row.totalPaymentThisPeriod.toFixed(2),
                row.principal.toFixed(2),
                row.interest.toFixed(2),
                row.feesThisPeriod.toFixed(2),
                row.remainingBalance.toFixed(2),
                row.availableCredit.toFixed(2)
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "amortization-schedule.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [data, cadence]);
    
    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center border-b pb-2 mb-4">
                <h2 className="text-xl font-bold text-slate-800">Amortization Schedule</h2>
                <button
                    onClick={handleExportCSV}
                    className="px-3 py-1 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center space-x-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Export CSV</span>
                </button>
            </div>
            <div className="max-h-96 overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{periodLabel}</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Beginning Balance</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Draw</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Total Payment</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Principal</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Interest</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fees</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ending Balance</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Available Credit</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {displayedData.map((row) => (
                            <tr key={row.period} className={row.period <= drawPeriodPeriods ? 'bg-sky-50/50' : ''}>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-500">{row.period}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatCurrency(row.beginningBalance)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sky-700 font-medium">{formatCurrency(row.drawAmount)}</td>
                                <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-800">{formatCurrency(row.totalPaymentThisPeriod)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatCurrency(row.principal)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatCurrency(row.interest)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatCurrency(row.feesThisPeriod)}</td>
                                <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{formatCurrency(row.remainingBalance)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-slate-700">{formatCurrency(row.availableCredit)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length > 12 && (
                 <div className="text-center mt-4">
                    <button onClick={() => setShowAll(!showAll)} className="text-brand-600 hover:text-brand-800 font-semibold text-sm">
                        {showAll ? 'Show Less' : `Show All ${data.length} ${periodLabel}s`}
                    </button>
                 </div>
            )}
        </div>
    );
};

// --- New Comparison Component ---

interface ComparisonDisplayProps {
    resultA: CalculationResult;
    resultB: CalculationResult;
    nameA: string;
    nameB: string;
    totalDrawsA: number;
    totalDrawsB: number;
    avgDrawA: number;
    avgDrawB: number;
    maxDrawA: number;
    maxDrawB: number;
    onExportCSV: () => void;
}

const ComparisonRow: React.FC<{ label: string; valueA: number; valueB: number; formatter: (v: number) => string; lowerIsBetter?: boolean; }> = 
({ label, valueA, valueB, formatter, lowerIsBetter = true }) => {
    const diff = valueB - valueA;
    const isADifferent = valueA !== valueB;
    const isABetter = lowerIsBetter ? valueA < valueB : valueA > valueB;

    const cellClass = (isBetter: boolean) => isADifferent ? (isBetter ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800') : '';

    return (
        <tr>
            <td className="p-3 text-sm text-slate-600 font-medium">{label}</td>
            <td className={`p-3 text-sm text-slate-800 text-center font-semibold ${cellClass(isABetter)}`}>{formatter(valueA)}</td>
            <td className={`p-3 text-sm text-slate-800 text-center font-semibold ${cellClass(!isABetter)}`}>{formatter(valueB)}</td>
            <td className={`p-3 text-sm text-center font-medium ${diff === 0 ? 'text-slate-500' : (lowerIsBetter ? (diff > 0 ? 'text-red-600' : 'text-green-600') : (diff > 0 ? 'text-green-600' : 'text-red-600'))}`}>
                {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatter(diff)}` : '-'}
            </td>
        </tr>
    );
};

const ComparisonDisplay: React.FC<ComparisonDisplayProps> = ({ 
    resultA, resultB, nameA, nameB,
    totalDrawsA, totalDrawsB, avgDrawA, avgDrawB, maxDrawA, maxDrawB,
    onExportCSV
}) => (
    <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h2 className="text-xl font-bold text-slate-800">Scenario Comparison</h2>
            <button
                onClick={onExportCSV}
                className="px-3 py-1 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center space-x-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export CSV</span>
            </button>
        </div>
        <table className="w-full">
            <thead>
                <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    <th className="p-3">Metric</th>
                    <th className="p-3 text-center">{nameA}</th>
                    <th className="p-3 text-center">{nameB}</th>
                    <th className="p-3 text-center">Difference</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
                <tr className="bg-slate-50">
                    <th colSpan={4} className="p-2 text-sm font-semibold text-slate-600 text-left">Financial Summary</th>
                </tr>
                <ComparisonRow label="Peak Balance" valueA={resultA.peakBalance} valueB={resultB.peakBalance} formatter={formatCurrency} />
                <ComparisonRow label="Term Payment" valueA={resultA.principalAndInterestPayment} valueB={resultB.principalAndInterestPayment} formatter={formatCurrency} />
                <ComparisonRow label="Effective APR" valueA={resultA.effectiveAPR} valueB={resultB.effectiveAPR} formatter={formatPercent} />
                <ComparisonRow label="Total Interest Paid" valueA={resultA.totalInterest} valueB={resultB.totalInterest} formatter={formatCurrency} />
                <ComparisonRow label="Total Fees Paid" valueA={resultA.totalFees} valueB={resultB.totalFees} formatter={formatCurrency} />
                <ComparisonRow label="Total Repayment" valueA={resultA.totalPayment} valueB={resultB.totalPayment} formatter={formatCurrency} />
            </tbody>
            <tbody className="divide-y divide-slate-200">
                 <tr className="bg-slate-50">
                    <th colSpan={4} className="p-2 pt-4 text-sm font-semibold text-slate-600 text-left">Draw Analysis</th>
                </tr>
                <ComparisonRow label="Total Draws" valueA={totalDrawsA} valueB={totalDrawsB} formatter={formatCurrency} />
                <ComparisonRow label="Maximum Draw" valueA={maxDrawA} valueB={maxDrawB} formatter={formatCurrency} />
                <ComparisonRow label="Average Draw" valueA={avgDrawA} valueB={avgDrawB} formatter={formatCurrency} />
            </tbody>
        </table>
    </div>
);


// --- Main App Component ---

interface RateChange {
  period: number;
  newTotalAPR: number;
}

interface ScenarioInputs {
  name: string;
  borrowLimit: number;
  initialDrawAmount: number;
  drawSchedule: number[];
  primeRate: number;
  margin: number;
  rateChanges: RateChange[];
  repaymentTerm: number;
  originationFee: number;
  annualFee: number;
  drawFee: number;
  inactivityFee: number;
  monthlyMaintenanceFee: number;
  repaymentCadence: 'monthly' | 'weekly';
  interestCalculationMethod: 'endOfPeriod' | 'adb';
  paymentPolicy: 'interestOnly' | 'percentOfBalance' | 'interestPlusPrincipalFloor';
  balancePaymentPercent: number;
  principalFloorAmount: number;
}

const defaultScenarioInputs: ScenarioInputs = {
  name: 'Scenario A',
  borrowLimit: 100000,
  initialDrawAmount: 0,
  drawSchedule: Array(36).fill(0),
  primeRate: 7.25,
  margin: 2.5,
  rateChanges: [],
  repaymentTerm: 5,
  originationFee: 1.0,
  annualFee: 0,
  drawFee: 0,
  inactivityFee: 0,
  monthlyMaintenanceFee: 0,
  repaymentCadence: 'monthly',
  interestCalculationMethod: 'endOfPeriod',
  paymentPolicy: 'interestOnly',
  balancePaymentPercent: 1.0,
  principalFloorAmount: 500,
};

export default function App() {
  const [isComparing, setIsComparing] = useState(false);
  const [activeScenario, setActiveScenario] = useState<'A' | 'B'>('A');
  const [scenarioA, setScenarioA] = useState<ScenarioInputs>(defaultScenarioInputs);
  const [scenarioB, setScenarioB] = useState<ScenarioInputs>({ ...defaultScenarioInputs, name: 'Scenario B' });
  
  const [resultA, setResultA] = useState<CalculationResult | null>(null);
  const [resultB, setResultB] = useState<CalculationResult | null>(null);

  // Calculate for Scenario A
  useEffect(() => {
      const { drawSchedule, initialDrawAmount, primeRate, margin, repaymentTerm, originationFee, annualFee, drawFee, inactivityFee, monthlyMaintenanceFee, borrowLimit, repaymentCadence, paymentPolicy, balancePaymentPercent, principalFloorAmount, rateChanges, interestCalculationMethod } = scenarioA;
      const calculatedResult = calculateAmortization(
        drawSchedule, initialDrawAmount, primeRate + margin, repaymentTerm, originationFee, annualFee, drawFee, inactivityFee, monthlyMaintenanceFee, borrowLimit, repaymentCadence, paymentPolicy, balancePaymentPercent, principalFloorAmount, rateChanges, interestCalculationMethod
      );
      setResultA(calculatedResult);
  }, [scenarioA]);

  // Calculate for Scenario B
  useEffect(() => {
      const { drawSchedule, initialDrawAmount, primeRate, margin, repaymentTerm, originationFee, annualFee, drawFee, inactivityFee, monthlyMaintenanceFee, borrowLimit, repaymentCadence, paymentPolicy, balancePaymentPercent, principalFloorAmount, rateChanges, interestCalculationMethod } = scenarioB;
      const calculatedResult = calculateAmortization(
        drawSchedule, initialDrawAmount, primeRate + margin, repaymentTerm, originationFee, annualFee, drawFee, inactivityFee, monthlyMaintenanceFee, borrowLimit, repaymentCadence, paymentPolicy, balancePaymentPercent, principalFloorAmount, rateChanges, interestCalculationMethod
      );
      setResultB(calculatedResult);
  }, [scenarioB]);
  
  const calculateExtendedMetrics = useCallback((result: CalculationResult | null) => {
    if (!result) return { totalDraws: 0, maxDraw: 0, avgDraw: 0 };
    
    const draws = result.schedule.filter(d => d.drawAmount > 0);
    // Include initial draw in total draws calculation
    const initialDraw = result.schedule.length > 0 ? (result.schedule[0].drawAmount > 0 ? 0 : scenarioA.initialDrawAmount) : 0;
    
    let totalDraws = draws.reduce((acc, curr) => acc + curr.drawAmount, 0);
     if (activeScenario === 'A') {
        totalDraws += scenarioA.initialDrawAmount;
    } else {
        totalDraws += scenarioB.initialDrawAmount;
    }
    
    const maxDraw = Math.max(0, ...draws.map(d => d.drawAmount));
    const avgDraw = draws.length > 0 ? totalDraws / draws.length : 0;
    
    return { totalDraws, maxDraw, avgDraw };
  }, [activeScenario, scenarioA.initialDrawAmount, scenarioB.initialDrawAmount]);

  const extendedMetricsA = useMemo(() => calculateExtendedMetrics(resultA), [resultA, calculateExtendedMetrics]);
  const extendedMetricsB = useMemo(() => calculateExtendedMetrics(resultB), [resultB, calculateExtendedMetrics]);


  const handleSetScenarioA = useCallback((updates: Partial<ScenarioInputs>) => {
    setScenarioA(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSetScenarioB = useCallback((updates: Partial<ScenarioInputs>) => {
    setScenarioB(prev => ({ ...prev, ...updates }));
  }, []);

  const handleReset = useCallback(() => {
    if (activeScenario === 'A') {
      setScenarioA(defaultScenarioInputs);
    } else {
      setScenarioB({ ...defaultScenarioInputs, name: 'Scenario B' });
    }
  }, [activeScenario]);

  const handleCopyToB = useCallback(() => {
    setScenarioB({...scenarioA, name: `${scenarioA.name} (Copy)`});
  }, [scenarioA]);
  
  const handleEnableComparison = useCallback(() => {
      setScenarioB({ ...scenarioA, name: 'Scenario B' }); // Start B as a copy of A, but with a default name
      setIsComparing(true);
      setActiveScenario('B');
  }, [scenarioA]);

  const handleRemoveComparison = useCallback(() => {
      setIsComparing(false);
      setActiveScenario('A');
      setScenarioB({ ...defaultScenarioInputs, name: 'Scenario B' }); // Reset B's data
  }, []);

  const handleExportComparisonCSV = useCallback(() => {
    if (!resultA || !resultB || !extendedMetricsA || !extendedMetricsB) return;

    const headers = [`"Metric"`, `"${scenarioA.name}"`, `"${scenarioB.name}"`, `"Difference"`];

    const metrics = [
        { label: 'Peak Balance', valueA: resultA.peakBalance, valueB: resultB.peakBalance },
        { label: 'Term Payment', valueA: resultA.principalAndInterestPayment, valueB: resultB.principalAndInterestPayment },
        { label: 'Effective APR (%)', valueA: resultA.effectiveAPR, valueB: resultB.effectiveAPR },
        { label: 'Total Interest Paid', valueA: resultA.totalInterest, valueB: resultB.totalInterest },
        { label: 'Total Fees Paid', valueA: resultA.totalFees, valueB: resultB.totalFees },
        { label: 'Total Repayment', valueA: resultA.totalPayment, valueB: resultB.totalPayment },
        { label: 'Total Draws', valueA: extendedMetricsA.totalDraws, valueB: extendedMetricsB.totalDraws },
        { label: 'Maximum Draw', valueA: extendedMetricsA.maxDraw, valueB: extendedMetricsB.maxDraw },
        { label: 'Average Draw', valueA: extendedMetricsA.avgDraw, valueB: extendedMetricsB.avgDraw },
    ];

    const rows = metrics.map(m => {
        const diff = m.valueB - m.valueA;
        return [`"${m.label}"`, m.valueA.toFixed(2), m.valueB.toFixed(2), diff.toFixed(2)].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    const safeNameA = scenarioA.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const safeNameB = scenarioB.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("download", `scenario_comparison_${safeNameA}_vs_${safeNameB}.csv`);
    
    link.setAttribute("href", url);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}, [resultA, resultB, scenarioA.name, scenarioB.name, extendedMetricsA, extendedMetricsB]);


  const activeScenarioInputs = activeScenario === 'A' ? scenarioA : scenarioB;
  const activeResult = activeScenario === 'A' ? resultA : resultB;
  const activeCadence = activeScenario === 'A' ? scenarioA.repaymentCadence : scenarioB.repaymentCadence;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
        <main className="container mx-auto p-4 md:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-8">
                    <CalculatorForm 
                        scenario={activeScenarioInputs}
                        setScenario={activeScenario === 'A' ? handleSetScenarioA : handleSetScenarioB}
                        activeScenario={activeScenario}
                        setActiveScenario={setActiveScenario}
                        scenarioA={scenarioA}
                        scenarioB={scenarioB}
                        onCopyToB={handleCopyToB}
                        onReset={handleReset}
                        isComparing={isComparing}
                        onEnableComparison={handleEnableComparison}
                        onRemoveComparison={handleRemoveComparison}
                    />
                </div>

                {activeResult && activeResult.schedule.length > 0 && (
                  <div className="lg:col-span-2 space-y-8">
                      {isComparing && resultA && resultB && (
                         <ComparisonDisplay 
                            resultA={resultA} 
                            resultB={resultB} 
                            nameA={scenarioA.name} 
                            nameB={scenarioB.name}
                            totalDrawsA={extendedMetricsA.totalDraws}
                            totalDrawsB={extendedMetricsB.totalDraws}
                            avgDrawA={extendedMetricsA.avgDraw}
                            avgDrawB={extendedMetricsB.avgDraw}
                            maxDrawA={extendedMetricsA.maxDraw}
                            maxDrawB={extendedMetricsB.maxDraw}
                            onExportCSV={handleExportComparisonCSV}
                         />
                      )}
                      <ResultsDisplay result={activeResult} />
                      <AmortizationChart data={activeResult.schedule} cadence={activeCadence}/>
                      <AmortizationTable data={activeResult.schedule} cadence={activeCadence}/>
                  </div>
                )}
            </div>
        </main>
    </div>
  );
}