import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const employeeGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const user = authService.currentUser();

    if (user && user.role === 'Employee') {
        return true;
    }

    if (!user) {
        router.navigate(['/login']);
    } else {
        router.navigate(['/admin/dashboard']);
    }
    return false;
};