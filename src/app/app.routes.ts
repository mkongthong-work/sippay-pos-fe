import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell/shell.component';
import { LoginComponent } from './pages/login/login.component';
import { PosComponent } from './pages/pos/pos.component';
import { OrdersComponent } from './pages/orders/orders.component';
import { KitchenComponent } from './pages/kitchen/kitchen.component';
import { MenuAdminComponent } from './pages/menu-admin/menu-admin.component';
import { ReportsComponent } from './pages/reports/reports.component';
import { CheckoutComponent } from './pages/checkout/checkout.component';
import { TableAdminComponent } from './pages/table-admin/table-admin.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'pos', pathMatch: 'full' },
      { path: 'pos', component: PosComponent },
      { path: 'orders', component: OrdersComponent },
      { path: 'kitchen', component: KitchenComponent },
      { path: 'checkout/:id', component: CheckoutComponent },
      { path: 'menu', component: MenuAdminComponent },
      { path: 'tables', component: TableAdminComponent },
      { path: 'reports', component: ReportsComponent },
      { path: '**', redirectTo: 'pos' }
    ]
  }
];
