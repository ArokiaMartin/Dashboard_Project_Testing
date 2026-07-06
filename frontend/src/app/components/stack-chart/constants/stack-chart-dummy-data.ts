// Dummy raw "fact table" data for Stack Chart component (until backend API is ready).
// This mimics what a real database table looks like BEFORE any GROUP BY / aggregation
// is applied. The data service (stack-chart-data.service.ts) performs the same
// GROUP BY + SUM/AVG/... logic a real backend would apply based on the selected
// dimensions + measures, so switching to a real API later requires no UI changes.

export const DUMMY_DATASETS = {
  sales: {
    name: 'Sales Data',
    dimensions: [
      { name: 'Region', displayName: 'Region', type: 'dimension', dataType: 'string' },
      { name: 'Product', displayName: 'Product', type: 'dimension', dataType: 'string' },
      { name: 'Month', displayName: 'Month', type: 'dimension', dataType: 'string' },
      { name: 'Department', displayName: 'Department', type: 'dimension', dataType: 'string' }
    ],
    measures: [
      { name: 'Sales', displayName: 'Sales Amount', type: 'measure', dataType: 'number' },
      { name: 'Revenue', displayName: 'Revenue', type: 'measure', dataType: 'number' },
      { name: 'Quantity', displayName: 'Quantity Sold', type: 'measure', dataType: 'number' },
      { name: 'Profit', displayName: 'Profit', type: 'measure', dataType: 'number' }
    ]
  },
  employee: {
    name: 'Employee Data',
    dimensions: [
      { name: 'Department', displayName: 'Department', type: 'dimension', dataType: 'string' },
      { name: 'Location', displayName: 'Location', type: 'dimension', dataType: 'string' },
      { name: 'Role', displayName: 'Job Role', type: 'dimension', dataType: 'string' }
    ],
    measures: [
      { name: 'Salary', displayName: 'Salary', type: 'measure', dataType: 'number' },
      { name: 'Age', displayName: 'Age', type: 'measure', dataType: 'number' },
      { name: 'Experience', displayName: 'Years of Experience', type: 'measure', dataType: 'number' }
    ]
  }
};

// Deterministic pseudo-random generator so numbers stay stable across reloads
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededValue(seedStr: string, base: number, spread: number): number {
  const h = hashStr(seedStr);
  return Math.round(base + ((h % 1000) / 1000) * spread);
}

function pick<T>(seedStr: string, options: T[]): T {
  return options[hashStr(seedStr) % options.length];
}

// ---- Raw sales transaction facts: one row per Region + Product + Month ----
// (Department is assigned per-row too, so grouping by Department also works.)
const REGIONS = ['North', 'South', 'East', 'West'];
const PRODUCTS = ['ProductA', 'ProductB', 'ProductC'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr'];
const SALES_DEPARTMENTS = ['Sales', 'Marketing', 'Operations'];

export const RAW_SALES_FACTS: Array<Record<string, string | number>> = [];
REGIONS.forEach(region => {
  PRODUCTS.forEach(product => {
    MONTHS.forEach(month => {
      const key = `${region}-${product}-${month}`;
      const sales = seededValue(`${key}-sales`, 2000, 6000);
      const revenue = Math.round(sales * 1.5);
      const quantity = Math.round(sales / 100);
      const profit = Math.round(revenue * 0.2);
      RAW_SALES_FACTS.push({
        Region: region,
        Product: product,
        Month: month,
        Department: pick(key, SALES_DEPARTMENTS),
        Sales: sales,
        Revenue: revenue,
        Quantity: quantity,
        Profit: profit
      });
    });
  });
});

// ---- Raw employee facts: one row per Department + Location + Role ----
const EMP_DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Operations', 'HR'];
const LOCATIONS = ['New York', 'London', 'Bangalore', 'Remote'];
const ROLES = ['Manager', 'Engineer', 'Analyst', 'Director'];

export const RAW_EMPLOYEE_FACTS: Array<Record<string, string | number>> = [];
EMP_DEPARTMENTS.forEach(department => {
  LOCATIONS.forEach(location => {
    ROLES.forEach(role => {
      const key = `${department}-${location}-${role}`;
      RAW_EMPLOYEE_FACTS.push({
        Department: department,
        Location: location,
        Role: role,
        Salary: seededValue(`${key}-salary`, 50000, 60000),
        Age: 25 + (hashStr(`${key}-age`) % 20),
        Experience: 1 + (hashStr(`${key}-exp`) % 15)
      });
    });
  });
});
