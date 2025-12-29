import { Routes } from '@angular/router';
import { employeeGuard } from '../../core/services/guards/employee.guard';
export const EMPLOYEE_ROUTES: Routes = [
    {
        path: 'dashboard',
        loadComponent: () => import('./dashboardemployee/dashboardemployee.component')
            .then(m => m.DashboardComponent), // Changed from EmployeeDashboardComponent
        canActivate: [employeeGuard]
    },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
];