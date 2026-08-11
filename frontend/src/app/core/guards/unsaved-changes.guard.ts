import { inject } from '@angular/core';
import { CanDeactivateFn, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';

/** Any component that wants deactivation protection implements this interface. */
export interface CanDeactivateComponent {
  canDeactivate(nextState?: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<CanDeactivateComponent> = (
  component: CanDeactivateComponent,
  currentRoute,
  currentState,
  nextState
): Observable<boolean> | Promise<boolean> | boolean => {
  // If navigating to the preview page, bypass the warning
  if (nextState?.url?.includes('/preview')) {
    return true;
  }
  return component.canDeactivate ? component.canDeactivate(nextState) : true;
};
