import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-team-logs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-logs.component.html',
  styleUrls: ['./team-logs.component.css']
})
export class TeamLogsComponent {
  // These variables will show in your top 3 cards
  totalHours: string = '0.0 hrs';
  averagePerDay: string = '0.0 hrs';
  totalEntries: number = 0;

  // Data for the 3 employee status cards shown in your image
  teamMembers = [
    { name: 'John Smith', email: 'john.smith@company.com', initial: 'J', hours: '0.0 hrs', days: 0 },
    { name: 'Emily Davis', email: 'emily.davis@company.com', initial: 'E', hours: '0.0 hrs', days: 0 },
    { name: 'David Wilson', email: 'david.wilson@company.com', initial: 'D', hours: '0.0 hrs', days: 0 }
  ];
}