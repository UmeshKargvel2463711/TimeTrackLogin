import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  // Data for the 4 KPI cards
  stats = [
    { label: 'Total Users', value: '2', icon: 'groups', color: 'purple' },
    { label: 'Active Users', value: '2', icon: 'person', color: 'green' },
    { label: 'Total Hours Logged', value: '39', icon: 'bar_chart', color: 'blue' },
    { label: 'Total Tasks', value: '5', icon: 'show_chart', color: 'orange' }
  ];

  // Data for the table
  users = [
    { name: 'John Smith', email: 'john.smith@company.com', role: 'Employee', department: 'Engineering', status: 'Active' },
    { name: 'umesh', email: 'umes@gmail.com', role: 'Employee', department: 'manager', status: 'Active' }
  ];
}