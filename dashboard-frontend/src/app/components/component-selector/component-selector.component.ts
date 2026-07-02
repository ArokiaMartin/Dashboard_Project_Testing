import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DashboardComponentConfig } from '../../models/dashboard.models';

@Component({
  selector: 'app-component-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './component-selector.component.html',
  styleUrl: './component-selector.component.css'
})
export class ComponentSelectorComponent {
  @Input() components: DashboardComponentConfig[] = [];
  @Input() selectedComponentId: string | null = null;
  @Input() disabled = false;
  @Output() componentSelected = new EventEmitter<string>();

  selectComponent(componentId: string): void {
    if (this.disabled) {
      return;
    }
    this.componentSelected.emit(componentId);
  }
}
