import { Dataset } from '../models/dashboard.models';

export const PREDEFINED_DATASETS: Dataset[] = [
  {
    id: 'employees',
    name: 'Employees',
    description: 'Employee details for department, location, and performance insights.',
    rows: [
      { employeeId: 1, name: 'Aarav', department: 'Engineering', role: 'Developer', salary: 75000, experience: 3, performanceScore: 82, joiningYear: 2021, location: 'Hyderabad' },
      { employeeId: 2, name: 'Meera', department: 'Engineering', role: 'Tester', salary: 68000, experience: 2, performanceScore: 76, joiningYear: 2022, location: 'Bangalore' },
      { employeeId: 3, name: 'Rohan', department: 'HR', role: 'Recruiter', salary: 55000, experience: 4, performanceScore: 71, joiningYear: 2020, location: 'Hyderabad' },
      { employeeId: 4, name: 'Sneha', department: 'Sales', role: 'Executive', salary: 62000, experience: 3, performanceScore: 88, joiningYear: 2021, location: 'Mumbai' },
      { employeeId: 5, name: 'Vikram', department: 'Finance', role: 'Analyst', salary: 70000, experience: 5, performanceScore: 79, joiningYear: 2019, location: 'Delhi' },
      { employeeId: 6, name: 'Priya', department: 'Engineering', role: 'Developer', salary: 82000, experience: 4, performanceScore: 91, joiningYear: 2020, location: 'Hyderabad' },
      { employeeId: 7, name: 'Karthik', department: 'Sales', role: 'Manager', salary: 90000, experience: 7, performanceScore: 86, joiningYear: 2018, location: 'Chennai' },
      { employeeId: 8, name: 'Ananya', department: 'Finance', role: 'Accountant', salary: 60000, experience: 3, performanceScore: 74, joiningYear: 2021, location: 'Bangalore' },
      { employeeId: 9, name: 'Ishaan', department: 'Engineering', role: 'Developer', salary: 78000, experience: 3, performanceScore: 84, joiningYear: 2022, location: 'Pune' },
      { employeeId: 10, name: 'Divya', department: 'HR', role: 'Manager', salary: 85000, experience: 6, performanceScore: 89, joiningYear: 2018, location: 'Delhi' }
    ]
  },
  {
    id: 'sales',
    name: 'Sales',
    description: 'Product sales data across category, region, and month.',
    rows: [
      { orderId: 101, product: 'Laptop', category: 'Electronics', region: 'South', salesAmount: 120000, quantity: 3, discount: 10, profit: 25000, month: 'Jan' },
      { orderId: 102, product: 'Mobile', category: 'Electronics', region: 'West', salesAmount: 80000, quantity: 5, discount: 8, profit: 18000, month: 'Feb' },
      { orderId: 103, product: 'Chair', category: 'Furniture', region: 'North', salesAmount: 30000, quantity: 10, discount: 5, profit: 7000, month: 'Mar' },
      { orderId: 104, product: 'Table', category: 'Furniture', region: 'South', salesAmount: 45000, quantity: 6, discount: 7, profit: 9500, month: 'Apr' },
      { orderId: 105, product: 'Notebook', category: 'Stationery', region: 'East', salesAmount: 15000, quantity: 50, discount: 3, profit: 4000, month: 'May' },
      { orderId: 106, product: 'Printer', category: 'Electronics', region: 'North', salesAmount: 60000, quantity: 4, discount: 6, profit: 14000, month: 'Jun' },
      { orderId: 107, product: 'Desk', category: 'Furniture', region: 'West', salesAmount: 38000, quantity: 7, discount: 4, profit: 8500, month: 'Jul' },
      { orderId: 108, product: 'Pen', category: 'Stationery', region: 'South', salesAmount: 10000, quantity: 100, discount: 2, profit: 3000, month: 'Aug' },
      { orderId: 109, product: 'Monitor', category: 'Electronics', region: 'East', salesAmount: 70000, quantity: 4, discount: 9, profit: 16000, month: 'Sep' },
      { orderId: 110, product: 'Cabinet', category: 'Furniture', region: 'North', salesAmount: 52000, quantity: 5, discount: 6, profit: 11000, month: 'Oct' }
    ]
  },
  {
    id: 'website-analytics',
    name: 'WebsiteAnalytics',
    description: 'Website page-level traffic and conversion performance by month.',
    rows: [
      { pageId: 1, pageName: 'Home', category: 'Landing', visitors: 12000, bounceRate: 42, avgSessionDuration: 180, conversions: 320, month: 'Jan' },
      { pageId: 2, pageName: 'Pricing', category: 'Sales', visitors: 8500, bounceRate: 35, avgSessionDuration: 220, conversions: 410, month: 'Feb' },
      { pageId: 3, pageName: 'Blog', category: 'Content', visitors: 15000, bounceRate: 55, avgSessionDuration: 160, conversions: 180, month: 'Mar' },
      { pageId: 4, pageName: 'Contact', category: 'Support', visitors: 4000, bounceRate: 30, avgSessionDuration: 200, conversions: 260, month: 'Apr' },
      { pageId: 5, pageName: 'Docs', category: 'Content', visitors: 9500, bounceRate: 48, avgSessionDuration: 300, conversions: 150, month: 'May' },
      { pageId: 6, pageName: 'Features', category: 'Sales', visitors: 7800, bounceRate: 33, avgSessionDuration: 240, conversions: 370, month: 'Jun' },
      { pageId: 7, pageName: 'Integrations', category: 'Product', visitors: 6200, bounceRate: 39, avgSessionDuration: 210, conversions: 290, month: 'Jul' },
      { pageId: 8, pageName: 'Security', category: 'Product', visitors: 5300, bounceRate: 37, avgSessionDuration: 260, conversions: 310, month: 'Aug' }
    ]
  }
];
