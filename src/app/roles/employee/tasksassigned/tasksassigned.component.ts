import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tasksassigned.component.html',
  styleUrls: ['./tasksassigned.component.css']
})
export class TasksComponent {
  @Input() tasks: any[] = [];
}