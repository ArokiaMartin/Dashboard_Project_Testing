import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <a class="navbar-brand" routerLink="/">
          <i class="bi bi-pie-chart-fill"></i>
          Dynamic Dashboard
        </a>
        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ms-auto">
            <li class="nav-item">
              <a class="nav-link" routerLink="/dashboards" routerLinkActive="active">
                Dashboards
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link" routerLink="/create" routerLinkActive="active">
                Create New
              </a>
            </li>
            <li class="nav-item">
              <a class="nav-link" routerLink="/about" routerLinkActive="active">
                About
              </a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  `,
  styles: [
    `
      .navbar-brand {
        font-weight: bold;
        font-size: 1.3rem;
      }

      .navbar-brand i {
        margin-right: 8px;
      }

      .nav-link {
        margin-left: 1rem;
      }
    `,
  ],
})
export class NavbarComponent {}
