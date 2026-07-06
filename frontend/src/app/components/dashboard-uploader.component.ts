import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardService } from '../services/dashboard.service';
import { SchemaService } from '../services/schema.service';
import { TableSchema } from '../types/dashboard.types';

@Component({
  selector: 'app-dashboard-uploader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-uploader.component.html',
  styleUrls: ['./dashboard-uploader.component.scss'],
})
export class DashboardUploaderComponent {
  @Output() schemaLoaded = new EventEmitter<TableSchema>();

  selectedFile: File | null = null;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private dashboardService: DashboardService,
    private schemaService: SchemaService
  ) {}

  onFileSelected(event: any): void {
    const file: File = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.errorMessage = '';
      this.successMessage = '';
    }
  }

  uploadSchema(): void {
    if (!this.selectedFile) {
      this.errorMessage = 'Please select a file to upload';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.dashboardService.uploadSchema(this.selectedFile).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success && response.schema) {
          this.successMessage = 'Schema uploaded successfully!';
          this.schemaService.setSchema(response.schema);
          this.schemaLoaded.emit(response.schema);
          this.selectedFile = null;
        } else {
          this.errorMessage = response.error || 'Failed to upload schema';
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = `Error uploading file: ${error.message}`;
      },
    });
  }

  dragOver = false;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(): void {
    this.dragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectedFile = files[0];
      this.errorMessage = '';
      this.successMessage = '';
    }
  }
}
