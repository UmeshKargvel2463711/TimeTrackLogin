import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
 
@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.css']
})
export class SigninComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
roles: string[] = ['Employee', 'Manager', 'Admin'];
  signinForm: FormGroup;
 
  constructor() {
    this.signinForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      role: ['', [Validators.required]]
    });
  }
 
  // Helper for HTML access
  get f() { return this.signinForm.controls; }
 
  // signin.component.ts
onLogin() {
  if (this.signinForm.valid) {
    const email = this.signinForm.value.email.toLowerCase();
    const selectedRole = this.signinForm.value.role;
 
    // Retrieve the role saved during registration
    const registeredRole = localStorage.getItem(email);
 
    if (!registeredRole) {
      alert('Email not found. Please register first.');
      return;
    }
 
    // Check if the role selected matches the role registered
    if (selectedRole !== registeredRole) {
      alert(`Access Denied: not ${selectedRole}.`);
      return;
    }
 
    alert('Login Successful!');
 
    // Role-based navigation using your folder structure
    if (selectedRole === 'Admin') {
      this.router.navigate(['/admin/dashboard']);
    } else if (selectedRole === 'Employee') {
      this.router.navigate(['/employee/dashboardemployee']);
    } else {
      this.router.navigate(['/manager']);
    }
  }
}
}