import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Widget, PaginatedData } from '../types/dashboard.types';

@Component({
  selector: 'app-table-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './table-widget.component.html',
  styleUrls: ['./table-widget.component.scss'],
})
export class TableWidgetComponent implements OnInit, OnChanges {
  @Input() widget!: Widget;
  @Input() data!: PaginatedData | any;

  displayData: any[] = [];
  columns: string[] = [];
  isLoading = false;
  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  totalPages = 1;

  sortColumn: string | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';

  constructor() {}

  ngOnInit(): void {
    this.prepareTable();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['widget']) {
      this.prepareTable();
    }
  }

  prepareTable(): void {
    if (!this.data) return;

    const config = this.widget?.config as any;

    // Determine columns
    if (config?.columns && config.columns.length > 0) {
      this.columns = config.columns;
    } else if (Array.isArray(this.data)) {
      // Auto-detect columns from first row
      if (this.data.length > 0) {
        this.columns = Object.keys(this.data[0]);
      }
    } else if (this.data.items) {
      // PaginatedData format
      if (this.data.items.length > 0) {
        this.columns = Object.keys(this.data.items[0]);
      }
      this.displayData = this.data.items;
      this.totalItems = this.data.total;
      this.totalPages = this.data.totalPages;
      this.currentPage = this.data.page;
      this.pageSize = this.data.pageSize;
      return;
    }

    this.displayData = Array.isArray(this.data) ? this.data : [];
    this.totalItems = this.displayData.length;
    this.totalPages = Math.ceil(this.totalItems / this.pageSize);
  }

  sortBy(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.displayData.sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];

      if (typeof aVal === 'string') {
        return this.sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  getPaginatedData(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.displayData.slice(start, end);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  getCellValue(row: any, column: string): string {
    const value = row[column];
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'bi-arrow-up-down';
    }
    return this.sortDirection === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down';
  }
}
