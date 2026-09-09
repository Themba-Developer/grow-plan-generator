export type FinancialAssumptions = {
  currency: string;
  years: number;
  startupInvestment: number;
  openingRevenue: number;
  annualGrowthRate: number;
  grossMarginRate: number;
  openingOperatingExpenses: number;
  operatingExpenseGrowthRate: number;
  taxRate: number;
  discountRate: number;
  depreciationYears: number;
  workingCapitalRate: number;
  maintenanceCapexRate: number;
};

export type FinancialYear = {
  year: number;
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  tax: number;
  netProfit: number;
  workingCapital: number;
  changeInWorkingCapital: number;
  maintenanceCapex: number;
  freeCashFlow: number;
  cumulativeCash: number;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function validate(input: FinancialAssumptions) {
  const values = Object.values(input).filter((value): value is number => typeof value === "number");
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Every financial assumption must be a valid number.");
  }
  if (input.years < 1 || input.years > 10) {
    throw new Error("Projection years must be between 1 and 10.");
  }
  if (input.depreciationYears < 1 || input.depreciationYears > 30) {
    throw new Error("Depreciation life must be between 1 and 30 years.");
  }
  if (
    input.startupInvestment < 0 ||
    input.openingRevenue < 0 ||
    input.openingOperatingExpenses < 0
  ) {
    throw new Error("Investment, revenue and operating expenses cannot be negative.");
  }
  for (const [label, rate] of [
    ["Gross margin", input.grossMarginRate],
    ["Tax", input.taxRate],
    ["Working capital", input.workingCapitalRate],
    ["Maintenance capital expenditure", input.maintenanceCapexRate],
  ] as const) {
    if (rate < 0 || rate > 100) throw new Error(`${label} rate must be between 0% and 100%.`);
  }
  if (input.annualGrowthRate <= -100 || input.operatingExpenseGrowthRate <= -100) {
    throw new Error("Growth rates must be greater than -100%.");
  }
  if (input.discountRate <= -100) throw new Error("The discount rate must be greater than -100%.");
}

function discountedValue(cashFlows: number[], rate: number) {
  return cashFlows.reduce((total, cashFlow, period) => total + cashFlow / (1 + rate) ** period, 0);
}

function findIrr(cashFlows: number[]) {
  let low = -0.999;
  let high = 10;
  if (discountedValue(cashFlows, low) * discountedValue(cashFlows, high) > 0) return null;
  for (let iteration = 0; iteration < 180; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (discountedValue(cashFlows, midpoint) > 0) low = midpoint;
    else high = midpoint;
  }
  return round(((low + high) / 2) * 100);
}

function calculateCore(input: FinancialAssumptions) {
  const years = Math.min(10, Math.max(1, Math.round(input.years)));
  const growth = input.annualGrowthRate / 100;
  const grossMargin = input.grossMarginRate / 100;
  const opexGrowth = input.operatingExpenseGrowthRate / 100;
  const taxRate = input.taxRate / 100;
  const workingCapitalRate = input.workingCapitalRate / 100;
  const maintenanceCapexRate = input.maintenanceCapexRate / 100;
  const annualDepreciation = input.startupInvestment / Math.round(input.depreciationYears);
  let priorWorkingCapital = 0;
  let cumulativeCash = -input.startupInvestment;

  const schedule: FinancialYear[] = Array.from({ length: years }, (_, index) => {
    const revenue = input.openingRevenue * (1 + growth) ** index;
    const costOfSales = revenue * (1 - grossMargin);
    const grossProfit = revenue - costOfSales;
    const operatingExpenses = input.openingOperatingExpenses * (1 + opexGrowth) ** index;
    const ebitda = grossProfit - operatingExpenses;
    const depreciation = index < input.depreciationYears ? annualDepreciation : 0;
    const ebit = ebitda - depreciation;
    const tax = Math.max(0, ebit * taxRate);
    const netProfit = ebit - tax;
    const workingCapital = revenue * workingCapitalRate;
    const changeInWorkingCapital = workingCapital - priorWorkingCapital;
    const maintenanceCapex = revenue * maintenanceCapexRate;
    const freeCashFlow = netProfit + depreciation - changeInWorkingCapital - maintenanceCapex;
    priorWorkingCapital = workingCapital;
    cumulativeCash += freeCashFlow;

    return {
      year: index + 1,
      revenue: round(revenue),
      costOfSales: round(costOfSales),
      grossProfit: round(grossProfit),
      operatingExpenses: round(operatingExpenses),
      ebitda: round(ebitda),
      depreciation: round(depreciation),
      ebit: round(ebit),
      tax: round(tax),
      netProfit: round(netProfit),
      workingCapital: round(workingCapital),
      changeInWorkingCapital: round(changeInWorkingCapital),
      maintenanceCapex: round(maintenanceCapex),
      freeCashFlow: round(freeCashFlow),
      cumulativeCash: round(cumulativeCash),
    };
  });

  const cashFlows = [-input.startupInvestment, ...schedule.map((row) => row.freeCashFlow)];
  return {
    schedule,
    cashFlows,
    npv: round(discountedValue(cashFlows, input.discountRate / 100)),
    irr: findIrr(cashFlows),
  };
}

export function calculateFinancialModel(input: FinancialAssumptions) {
  validate(input);
  const core = calculateCore(input);
  const grossMargin = input.grossMarginRate / 100;
  const annualDepreciation = input.startupInvestment / Math.round(input.depreciationYears);
  const ebitdaBreakEvenRevenue = grossMargin
    ? round(input.openingOperatingExpenses / grossMargin)
    : null;
  const accountingBreakEvenRevenue = grossMargin
    ? round((input.openingOperatingExpenses + annualDepreciation) / grossMargin)
    : null;
  const paybackYear = core.schedule.find((row) => row.cumulativeCash >= 0)?.year ?? null;
  const growthCases = [-5, 0, 5];
  const marginCases = [-3, 0, 3];
  const sensitivity = marginCases.map((marginDelta) => ({
    marginDelta,
    values: growthCases.map((growthDelta) => ({
      growthDelta,
      npv: calculateCore({
        ...input,
        annualGrowthRate: input.annualGrowthRate + growthDelta,
        grossMarginRate: Math.min(100, Math.max(0, input.grossMarginRate + marginDelta)),
      }).npv,
    })),
  }));

  return {
    ...core,
    ebitdaBreakEvenRevenue,
    accountingBreakEvenRevenue,
    paybackYear,
    contributionMarginRate: grossMargin,
    sensitivity,
  };
}

function money(value: number, currency: string) {
  const code = currency.trim().toUpperCase();
  const locale = code === "ZAR" ? "en-ZA" : code === "GBP" ? "en-GB" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  } catch {
    return `${code || "ZAR"} ${Math.round(value).toLocaleString(locale)}`;
  }
}

export function financialModelMarkdown(input: FinancialAssumptions) {
  const result = calculateFinancialModel(input);
  const profitRows = result.schedule
    .map(
      (row) =>
        `| Year ${row.year} | ${money(row.revenue, input.currency)} | ${money(row.grossProfit, input.currency)} | ${money(row.ebitda, input.currency)} | ${money(row.ebit, input.currency)} | ${money(row.netProfit, input.currency)} |`,
    )
    .join("\n");
  const costRows = result.schedule
    .map(
      (row) =>
        `| Year ${row.year} | ${money(row.costOfSales, input.currency)} | ${money(row.operatingExpenses, input.currency)} | ${money(row.depreciation, input.currency)} | ${money(row.tax, input.currency)} |`,
    )
    .join("\n");
  const cashRows = result.schedule
    .map(
      (row) =>
        `| Year ${row.year} | ${money(row.netProfit, input.currency)} | ${money(row.depreciation, input.currency)} | ${money(row.changeInWorkingCapital, input.currency)} | ${money(row.maintenanceCapex, input.currency)} | ${money(row.freeCashFlow, input.currency)} | ${money(row.cumulativeCash, input.currency)} |`,
    )
    .join("\n");
  const sensitivityRows = result.sensitivity
    .map(
      (row) =>
        `| Gross margin ${row.marginDelta >= 0 ? "+" : ""}${row.marginDelta}% | ${row.values.map((cell) => money(cell.npv, input.currency)).join(" | ")} |`,
    )
    .join("\n");

  return `### Deterministic financial source of truth

These schedules were calculated in application code from the user's assumptions. Do not alter the figures or invent missing inputs.

Assumptions: ${input.currency}; opening annual revenue ${money(input.openingRevenue, input.currency)}; revenue growth ${input.annualGrowthRate}%; gross margin ${input.grossMarginRate}%; opening operating expenses ${money(input.openingOperatingExpenses, input.currency)} growing ${input.operatingExpenseGrowthRate}% annually; tax ${input.taxRate}%; initial investment ${money(input.startupInvestment, input.currency)}; straight-line depreciation over ${input.depreciationYears} years; working capital ${input.workingCapitalRate}% of revenue; maintenance capital expenditure ${input.maintenanceCapexRate}% of revenue; discount rate ${input.discountRate}%.

#### Projected profit and loss

| Period | Revenue | Gross profit | EBITDA | EBIT | Net profit |
|---|---:|---:|---:|---:|---:|
${profitRows}

#### Operating cost and tax detail

| Period | Cost of sales | Operating expenses | Depreciation | Tax |
|---|---:|---:|---:|---:|
${costRows}

#### Simplified free cash flow

| Period | Net profit | Depreciation added back | Change in working capital | Maintenance capex | Free cash flow | Cumulative cash after initial investment |
|---|---:|---:|---:|---:|---:|---:|
${cashRows}

- EBITDA break-even revenue: ${result.ebitdaBreakEvenRevenue === null ? "Not calculable because the gross margin is zero" : money(result.ebitdaBreakEvenRevenue, input.currency)}
- Accounting break-even revenue including straight-line depreciation: ${result.accountingBreakEvenRevenue === null ? "Not calculable because the gross margin is zero" : money(result.accountingBreakEvenRevenue, input.currency)}
- Simple free-cash-flow payback: ${result.paybackYear ? `Year ${result.paybackYear}` : `Not achieved within ${input.years} years`}
- Net present value at ${input.discountRate}%: ${money(result.npv, input.currency)}
- Project IRR: ${result.irr === null ? "No rate found for the supplied cash-flow pattern" : `${result.irr.toFixed(2)}%`}

#### NPV sensitivity analysis

Each cell varies annual revenue growth by the column amount and gross margin by the row amount while holding other assumptions constant.

| Scenario | Growth -5% | Base growth | Growth +5% |
|---|---:|---:|---:|
${sensitivityRows}

Calculation boundary: this is an unlevered planning model. It excludes debt drawdowns, interest, principal repayments, dividends, VAT timing, loss carry-forwards, asset residual values and a fully integrated balance sheet unless those schedules are supplied separately. A qualified accountant should review tax and accounting treatment before external reliance.`;
}
