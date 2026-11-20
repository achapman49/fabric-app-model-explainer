/**
 * Two more fictional demo models:
 * - Sample Operations Model: 40+ tables in several star schemas plus loose tables, and no measures. Shows the diagram
 *   clustering by connected component and the "Try it" explanation for models without measures.
 * - Sample Finance Model: measure and relationship metadata are blocked, to show per-section degradation.
 */
import type { MockColumn, MockModel, MockRelationship, MockTable } from './spec';

function dim(name: string, rows: number, extra: MockColumn[] = []): MockTable {
  return {
    name,
    description: `One row per ${name.toLowerCase()}.`,
    storageMode: 'Import',
    rows,
    columns: [
      { name: `${name} Key`, dataType: 'Integer', isHidden: true },
      { name: `${name} Name`, dataType: 'Text', samples: Array.from({ length: 8 }, (_, i) => `${name} ${String.fromCharCode(65 + i)}`) },
      { name: `${name} Code`, dataType: 'Text' },
      ...extra,
    ],
  };
}

function star(fact: string, rows: number, dims: string[], measuresCols: MockColumn[]): { tables: MockTable[]; rels: MockRelationship[] } {
  const factTable: MockTable = {
    name: fact,
    description: `One row per ${fact.toLowerCase().replace(/s$/, '')} event.`,
    storageMode: 'DirectLake',
    rows,
    columns: [
      ...dims.map((d) => ({ name: `${d} Key`, dataType: 'Integer' as const, isHidden: true })),
      { name: `${fact} Date`, dataType: 'DateTime' },
      ...measuresCols,
    ],
  };
  return {
    tables: [factTable, ...dims.map((d, i) => dim(d, 20 + i * 37))],
    rels: dims.map((d) => ({ from: [fact, `${d} Key`], to: [d, `${d} Key`] })),
  };
}

const stars = [
  star('Stock Movements', 3_400_000, ['Warehouse', 'Item', 'Supplier', 'Movement Type', 'Bin Location', 'Unit of Measure', 'Stock Calendar'], [
    { name: 'Quantity', dataType: 'Number' },
    { name: 'Value', dataType: 'Currency' },
  ]),
  star('Deliveries', 820_000, ['Vehicle', 'Driver', 'Route', 'Depot', 'Delivery Status', 'Customer Site'], [
    { name: 'Distance Km', dataType: 'Number' },
    { name: 'Minutes Late', dataType: 'Integer' },
  ]),
  star('Work Orders', 96_000, ['Asset', 'Technician', 'Fault Code', 'Priority', 'Shift'], [{ name: 'Labour Hours', dataType: 'Number' }]),
  star('Purchase Order Lines', 410_000, ['Purchase Order', 'Buyer', 'Contract', 'Payment Terms', 'Currency'], [
    { name: 'Ordered Quantity', dataType: 'Number' },
    { name: 'Line Amount', dataType: 'Currency' },
  ]),
  star('Inspections', 58_000, ['Inspection Plan', 'Defect Type', 'Lot', 'Inspector'], [{ name: 'Defects Found', dataType: 'Integer' }]),
];

// Outriggers and loose tables.
const extraTables: MockTable[] = [
  dim('Item Group', 40),
  dim('Asset Class', 12),
  dim('Region', 6),
  ...['Parameters', 'Exchange Rates', 'Holiday Calendar', 'Report Labels', 'Last Refresh', 'KPI Thresholds', 'Staging Items', 'Staging Suppliers'].map(
    (name): MockTable => ({
      name,
      description: `Helper table: ${name.toLowerCase()}.`,
      storageMode: 'Import',
      rows: 25,
      columns: [
        { name: 'Name', dataType: 'Text' },
        { name: 'Value', dataType: 'Text' },
        { name: 'Updated', dataType: 'DateTime' },
      ],
    }),
  ),
];
const itemTable = stars[0].tables.find((t) => t.name === 'Item')!;
itemTable.columns.push({ name: 'Item Group Key', dataType: 'Integer', isHidden: true });
const assetTable = stars[2].tables.find((t) => t.name === 'Asset')!;
assetTable.columns.push({ name: 'Asset Class Key', dataType: 'Integer', isHidden: true });
const depotTable = stars[1].tables.find((t) => t.name === 'Depot')!;
depotTable.columns.push({ name: 'Region Key', dataType: 'Integer', isHidden: true });
const warehouseTable = stars[0].tables.find((t) => t.name === 'Warehouse')!;
warehouseTable.columns.push({ name: 'Region Key', dataType: 'Integer', isHidden: true });

export const operationsModel: MockModel = {
  key: 'operations',
  label: 'Sample Operations Model',
  note: 'Fictional 40+ table model with no measures: clustered diagram, no sample questions.',
  tables: [...stars.flatMap((s) => s.tables), ...extraTables],
  measures: [],
  relationships: [
    ...stars.flatMap((s) => s.rels),
    { from: ['Item', 'Item Group Key'], to: ['Item Group', 'Item Group Key'] },
    { from: ['Asset', 'Asset Class Key'], to: ['Asset Class', 'Asset Class Key'] },
    // Region links the warehouse and delivery stars into one component.
    { from: ['Depot', 'Region Key'], to: ['Region', 'Region Key'] },
    { from: ['Warehouse', 'Region Key'], to: ['Region', 'Region Key'] },
  ],
};

export const financeModel: MockModel = {
  key: 'finance',
  label: 'Sample Finance Model',
  note: 'Fictional model where measure and relationship metadata are blocked: other tabs keep working.',
  blocked: ['measures', 'relationships'],
  tables: [
    {
      name: 'GL Entries',
      description: 'General ledger lines, one row per posting.',
      storageMode: 'DirectLake',
      rows: 5_120_000,
      columns: [
        { name: 'Account Key', dataType: 'Integer', isHidden: true },
        { name: 'Cost Centre Key', dataType: 'Integer', isHidden: true },
        { name: 'Posting Date', dataType: 'DateTime' },
        { name: 'Amount', dataType: 'Currency' },
        { name: 'Journal Type', dataType: 'Text', samples: ['Accrual', 'Payment', 'Invoice', 'Adjustment'] },
      ],
    },
    dim('Account', 640, [{ name: 'Account Type', dataType: 'Text', samples: ['Revenue', 'Expense', 'Asset', 'Liability'] }]),
    dim('Cost Centre', 85),
    {
      name: 'Fiscal Calendar',
      description: 'Fiscal days, weeks and periods.',
      storageMode: 'Import',
      rows: 2_557,
      columns: [
        { name: 'Date', dataType: 'DateTime' },
        { name: 'Fiscal Period', dataType: 'Text' },
        { name: 'Fiscal Year', dataType: 'Text' },
      ],
    },
  ],
  measures: [],
  relationships: [],
};
