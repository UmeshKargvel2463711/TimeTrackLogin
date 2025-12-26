import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-admin',
  standalone: true,
  // RouterModule is essential here to make <router-outlet> and routerLink work
  imports: [CommonModule, RouterModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent {
  // Metadata for the header
  adminName: string = 'Harsh';
  department: string = 'IT';

  onLogout() {
    console.log('User logged out');
    // Add navigation logic to login page here if needed
  }
}