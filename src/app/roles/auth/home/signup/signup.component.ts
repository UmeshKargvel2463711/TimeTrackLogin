import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

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

  signupForm: FormGroup;
  // This must be false for the password to be hidden (dotted) by default
  showPassword = false;

  // Roles for the dropdown
  roles: string[] = ['Employee', 'Manager', 'Admin'];

  // Departments for the dropdown
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
        // Enforces: 8+ chars, 1 Upper, 1 Lower, 1 Number, 1 Symbol
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
      ]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  // Custom validator to ensure password and confirmPassword match
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  // Helper getter for easy access to form controls in the HTML template
  get f() { return this.signupForm.controls; }

  // Toggles the showPassword boolean when the eye icon is clicked
  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  // Handles form submission
 // signup.component.ts
onSubmit() {
  if (this.signupForm.valid) {
    const userData = {
      email: this.signupForm.value.email.toLowerCase(),
      role: this.signupForm.value.role
    };
    
    // Save to localStorage so Sign-In can find it later
    localStorage.setItem(userData.email, userData.role);
    
    alert(`Account created for ${this.signupForm.value.fullName} as ${userData.role}`);
    this.router.navigate(['/signin']);
  }
}
}