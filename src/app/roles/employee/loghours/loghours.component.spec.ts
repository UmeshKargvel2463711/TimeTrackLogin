import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LogHoursComponent } from './loghours.component';

describe('LogHoursComponent', () => {
  let component: LogHoursComponent;
  let fixture: ComponentFixture<LogHoursComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogHoursComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LogHoursComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
