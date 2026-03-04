import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ManagerDataService } from '../../core/services/manager-data.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css']
})
export class SignupComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private managerDataService = inject(ManagerDataService);

  signupForm: FormGroup;
  showPassword = false;
  isSubmitting = false;

  roles: string[] = ['Employee', 'Manager'];

  departments: string[] = [
    'Dot-net Angular',
    'Java Angular',
    'Java React',
    'Multi cloud'
  ];

  constructor() {
    this.signupForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      role: ['', [Validators.required]],
      department: ['', [Validators.required]],
      password: ['', [
        Validators.required,
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
      ]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  get f() { return this.signupForm.controls; }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    if (this.signupForm.valid && !this.isSubmitting) {
      this.isSubmitting = true;

      const userData = {
        name: this.signupForm.value.fullName,
        email: this.signupForm.value.email.toLowerCase(),
        role: this.signupForm.value.role,
        department: this.signupForm.value.department,
        password: this.signupForm.value.password
      };

      // Call backend API - registration goes to pending approval
      this.authService.registerAsync(userData).subscribe({
        next: (response: any) => {
          this.isSubmitting = false;

          // Check if registration is pending approval
          if (response.data?.status === 'Pending') {
            this.notificationService.success(
              'Registration submitted! Please wait for admin approval before logging in.',
              5000
            );
          } else {
            this.notificationService.success(
              response.message || `Registration successful for ${userData.name}!`
            );
          }

          this.router.navigate(['/signin']);
        },
        error: (err: any) => {
          this.isSubmitting = false;

          if (err.error?.errors) {
            const validationErrors = err.error.errors;
            const messages = Object.keys(validationErrors)
              .map(key => {
                const val = validationErrors[key];
                return Array.isArray(val) ? val.join(', ') : String(val);
              })
              .join(' | ');
            this.notificationService.error(messages);
          } else {
            const message = err.error?.message || err.error?.title || 'Registration failed. Please try again.';
            this.notificationService.error(message);
          }
        }
      });
    } else {
      this.signupForm.markAllAsTouched();
    }
  }
}
