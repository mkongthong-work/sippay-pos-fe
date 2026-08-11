import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { adminGuard } from './core/admin.guard';
import { ShellComponent } from './layout/shell/shell.component';
import { LoginComponent } from './pages/login/login.component';
import { PinLoginComponent } from './pages/pin-login/pin-login.component';
import { PosComponent } from './pages/pos/pos.component';
import { OrdersComponent } from './pages/orders/orders.component';
import { KitchenComponent } from './pages/kitchen/kitchen.component';
import { MenuAdminComponent } from './pages/menu-admin/menu-admin.component';
import { ReportsComponent } from './pages/reports/reports.component';
import { CheckoutComponent } from './pages/checkout/checkout.component';
import { TableAdminComponent } from './pages/table-admin/table-admin.component';
import { StaffAdminComponent } from './pages/staff-admin/staff-admin.component';
import { ReservationsComponent } from './pages/reservations/reservations.component';
import { ShopSettingsAdminComponent } from './pages/shop-settings-admin/shop-settings-admin.component';
import { LoyaltyComponent } from './pages/loyalty/loyalty.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'pin-login', component: PinLoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'pos', pathMatch: 'full' },
      { path: 'pos', component: PosComponent },
      { path: 'orders', component: OrdersComponent },
      { path: 'reservations', component: ReservationsComponent },
      { path: 'kitchen', component: KitchenComponent },
      { path: 'checkout/:id', component: CheckoutComponent },
      { path: 'menu', component: MenuAdminComponent },
      { path: 'tables', component: TableAdminComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'loyalty', component: LoyaltyComponent },
      { path: 'staff', component: StaffAdminComponent, canActivate: [adminGuard] },
      { path: 'shop-settings', component: ShopSettingsAdminComponent, canActivate: [adminGuard] },
      { path: '**', redirectTo: 'pos' }
    ]
  }
];
