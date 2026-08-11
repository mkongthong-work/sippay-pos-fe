import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  username = '';
  password = '';
  loading = signal(false);

  constructor(
    private auth: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {}

  submit(): void {
    this.loading.set(true);
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/pos']);
      },
      error: (err) => {
        this.loading.set(false);
        this.toastService.error(err?.error?.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
      }
    });
  }
}
