import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import Chart from 'chart.js/auto';

@Component({
  selector: 'app-team-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-analytics.component.html',
  styleUrls: ['./team-analytics.component.css']
})
export class TeamAnalyticsComponent implements OnInit, AfterViewInit {
  teamPerformance = [
    { name: 'John', hours: 23.3, tasks: 1, efficiency: 82, status: 'Excellent' },
    { name: 'Emily', hours: 7.5, tasks: 0, efficiency: 35, status: 'Excellent' },
    { name: 'David', hours: 8.5, tasks: 0, efficiency: 0, status: 'Needs Attention' }
  ];

  ngOnInit() {}

  ngAfterViewInit() {
    this.createTrendChart();
    this.createMemberChart();
  }

  createTrendChart() {
    new Chart("trendChart", {
      type: 'line',
      data: {
        labels: ['Dec 19', 'Dec 20', 'Dec 21', 'Dec 22', 'Dec 23', 'Dec 24', 'Dec 25'],
        datasets: [{
          label: 'Hours',
          data: [0, 0, 0, 0, 0, 0, 0],
          borderColor: '#6366f1',
          tension: 0.4,
          pointBackgroundColor: '#6366f1'
        }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 4 } } }
    });
  }

  createMemberChart() {
    new Chart("memberChart", {
      type: 'bar',
      data: {
        labels: ['John', 'Emily', 'David'],
        datasets: [{
          data: [24, 8, 9],
          backgroundColor: '#6366f1',
          borderRadius: 5
        }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 24 } } }
    });
  }
}