import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  Category,
  CategoryOptionTemplate,
  MenuItem,
  MenuOptionChoice,
  MenuOptionGroup
} from './models';
import { API_BASE_URL } from './api-config';

export interface CreateOptionGroupInput {
  name: string;
  is_required: boolean;
  choices: { name: string; price_delta: number }[];
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  constructor(private http: HttpClient) {}

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${API_BASE_URL}/categories`);
  }

  createCategory(data: Partial<Category>): Observable<Category> {
    return this.http.post<Category>(`${API_BASE_URL}/categories`, data);
  }

  updateCategory(id: number, data: Partial<Category>): Observable<Category> {
    return this.http.put<Category>(`${API_BASE_URL}/categories/${id}`, data);
  }

  deleteCategory(id: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/categories/${id}`);
  }

  getMenuItems(categoryId?: number): Observable<MenuItem[]> {
    let url = `${API_BASE_URL}/menu-items`;
    if (categoryId) {
      url += `?category_id=${categoryId}`;
    }
    return this.http.get<MenuItem[]>(url);
  }

  createMenuItem(data: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.post<MenuItem>(`${API_BASE_URL}/menu-items`, data);
  }

  updateMenuItem(id: number, data: Partial<MenuItem>): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${API_BASE_URL}/menu-items/${id}`, data);
  }

  deleteMenuItem(id: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/menu-items/${id}`);
  }

  // ---- ตัวเลือกเมนู เช่น ความหวาน, ไซส์ ----

  createOptionGroup(menuItemId: number, data: CreateOptionGroupInput): Observable<MenuOptionGroup> {
    return this.http.post<MenuOptionGroup>(`${API_BASE_URL}/menu-items/${menuItemId}/option-groups`, data);
  }

  updateOptionGroup(
    groupId: number,
    data: { name?: string; is_required?: boolean }
  ): Observable<MenuOptionGroup> {
    return this.http.put<MenuOptionGroup>(`${API_BASE_URL}/option-groups/${groupId}`, data);
  }

  deleteOptionGroup(groupId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/option-groups/${groupId}`);
  }

  addOptionChoice(
    groupId: number,
    data: { name: string; price_delta: number }
  ): Observable<MenuOptionChoice> {
    return this.http.post<MenuOptionChoice>(`${API_BASE_URL}/option-groups/${groupId}/choices`, data);
  }

  deleteOptionChoice(choiceId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/choices/${choiceId}`);
  }

  // ---- ค่าเริ่มต้นตัวเลือกระดับหมวดหมู่ (นำไปใช้ซ้ำกับหลายเมนูในหมวดเดียวกันได้) ----

  getCategoryOptionTemplates(categoryId: number): Observable<CategoryOptionTemplate[]> {
    return this.http.get<CategoryOptionTemplate[]>(
      `${API_BASE_URL}/categories/${categoryId}/option-templates`
    );
  }

  createCategoryOptionTemplate(
    categoryId: number,
    data: CreateOptionGroupInput
  ): Observable<CategoryOptionTemplate> {
    return this.http.post<CategoryOptionTemplate>(
      `${API_BASE_URL}/categories/${categoryId}/option-templates`,
      data
    );
  }

  deleteCategoryOptionTemplate(templateId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/option-templates/${templateId}`);
  }

  applyOptionTemplateToMenuItem(menuItemId: number, templateId: number): Observable<MenuOptionGroup> {
    return this.http.post<MenuOptionGroup>(
      `${API_BASE_URL}/menu-items/${menuItemId}/option-groups/from-template/${templateId}`,
      {}
    );
  }
}
