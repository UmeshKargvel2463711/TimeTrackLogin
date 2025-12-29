import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

@Component({
  selector: 'app-productivity',
  standalone: true,
  templateUrl: './personalreports.component.html',
  styleUrls: ['./personalreports.component.css']
})
export class personalreportsComponent implements AfterViewInit {
  @ViewChild('hoursChart') hoursChartCanvas!: ElementRef;

  ngAfterViewInit() {
    new Chart(this.hoursChartCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Dec 13', 'Dec 14', 'Dec 15'],
        datasets: [{ label: 'Hours', data: [7.75, 8.0, 7.5], backgroundColor: '#0ea5e9' }]
      }
    });
  }
}