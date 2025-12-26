import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './roles/auth/home/home.component';
import { NgModule } from '@angular/core';
import { SignupComponent } from './roles/auth/home/signup/signup.component';
import { ManagerComponent } from './roles/manager/manager.component';

export const routes: Routes = [
    { path: '',component:HomeComponent},
    { path:'signup', component:SignupComponent},
    { path:'manager', component:ManagerComponent}
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})

export class AppRoutingMosule{}
