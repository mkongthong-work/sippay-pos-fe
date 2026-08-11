import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  Category,
  CategoryOptionTemplate,
  CategoryOptionTemplateChoice,
  MenuItem,
  MenuOptionChoice,
  MenuOptionGroup
} from './models';
import { API_BASE_URL } from './api-config';

export interface CreateOptionGroupInput {
  name: string;
  description?: string;
  selection_type?: 'single' | 'multi';
  min_select?: number;
  max_select?: number;
  is_required: boolean;
  sort_order?: number;
  choices: { name: string; price_delta: number; is_default?: boolean }[];
}

@Injectable({ providedIn: 'root' })
export class MenuService {
  constructor(private http: HttpClient) {}

  getCategories(includeArchived = false): Observable<Category[]> {
    const url = includeArchived
      ? `${API_BASE_URL}/categories?include_archived=true`
      : `${API_BASE_URL}/categories`;
    return this.http.get<Category[]>(url);
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

  archiveCategory(id: number): Observable<Category> {
    return this.http.put<Category>(`${API_BASE_URL}/categories/${id}/archive`, {});
  }

  restoreCategory(id: number): Observable<Category> {
    return this.http.put<Category>(`${API_BASE_URL}/categories/${id}/restore`, {});
  }

  getMenuItems(categoryId?: number, includeArchived = false): Observable<MenuItem[]> {
    let url = `${API_BASE_URL}/menu-items`;
    const params: string[] = [];
    if (categoryId) params.push(`category_id=${categoryId}`);
    if (includeArchived) params.push('include_archived=true');
    if (params.length > 0) url += `?${params.join('&')}`;
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

  archiveMenuItem(id: number): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${API_BASE_URL}/menu-items/${id}/archive`, {});
  }

  restoreMenuItem(id: number): Observable<MenuItem> {
    return this.http.put<MenuItem>(`${API_BASE_URL}/menu-items/${id}/restore`, {});
  }

  uploadMenuItemImage(id: number, file: File): Observable<MenuItem> {
    const form = new FormData();
    form.set('image', file);
    return this.http.put<MenuItem>(`${API_BASE_URL}/menu-items/${id}/image`, form);
  }

  deleteMenuItemImage(id: number): Observable<MenuItem> {
    return this.http.delete<MenuItem>(`${API_BASE_URL}/menu-items/${id}/image`);
  }

  // ---- ตัวเลือกเมนู เช่น ความหวาน, ไซส์ ----

  createOptionGroup(menuItemId: number, data: CreateOptionGroupInput): Observable<MenuOptionGroup> {
    return this.http.post<MenuOptionGroup>(`${API_BASE_URL}/menu-items/${menuItemId}/option-groups`, data);
  }

  updateOptionGroup(
    groupId: number,
    data: {
      name?: string;
      description?: string;
      selection_type?: 'single' | 'multi';
      min_select?: number;
      max_select?: number;
      is_required?: boolean;
      is_enabled?: boolean;
      sort_order?: number;
    }
  ): Observable<MenuOptionGroup> {
    return this.http.put<MenuOptionGroup>(`${API_BASE_URL}/option-groups/${groupId}`, data);
  }

  deleteOptionGroup(groupId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/option-groups/${groupId}`);
  }

  addOptionChoice(
    groupId: number,
    data: { name: string; price_delta: number; is_default?: boolean; sort_order?: number }
  ): Observable<MenuOptionChoice> {
    return this.http.post<MenuOptionChoice>(`${API_BASE_URL}/option-groups/${groupId}/choices`, data);
  }

  updateOptionChoice(
    choiceId: number,
    data: { name?: string; price_delta?: number; is_default?: boolean; is_enabled?: boolean; sort_order?: number }
  ): Observable<MenuOptionChoice> {
    return this.http.put<MenuOptionChoice>(`${API_BASE_URL}/choices/${choiceId}`, data);
  }

  deleteOptionChoice(choiceId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/choices/${choiceId}`);
  }

  // ---- เทมเพลตกลุ่มตัวเลือก ("ตัวเลือกเสริม") — แสดงรวมทุกหมวดหมู่ นำไปใช้ซ้ำกับเมนูไหนก็ได้ ----

  // รายการทั้งหมดทุกหมวดหมู่ (ใช้ในแท็บ "ตัวเลือกเสริม" ที่เป็น card grid รวม)
  getAllCategoryOptionTemplates(): Observable<CategoryOptionTemplate[]> {
    return this.http.get<CategoryOptionTemplate[]>(`${API_BASE_URL}/option-templates`);
  }

  // รายการเฉพาะหมวดหมู่เดียว (ใช้ตอนเลือก "นำเทมเพลตมาใช้" กับเมนูในหมวดนั้น)
  getCategoryOptionTemplates(categoryId: number): Observable<CategoryOptionTemplate[]> {
    return this.http.get<CategoryOptionTemplate[]>(
      `${API_BASE_URL}/categories/${categoryId}/option-templates`
    );
  }

  // รายการที่เก็บถาวรไว้ (ใช้ในแท็บ "เมนูที่เก็บถาวร")
  getArchivedCategoryOptionTemplates(): Observable<CategoryOptionTemplate[]> {
    return this.http.get<CategoryOptionTemplate[]>(`${API_BASE_URL}/option-templates/archived`);
  }

  archiveCategoryOptionTemplate(templateId: number): Observable<CategoryOptionTemplate> {
    return this.http.put<CategoryOptionTemplate>(`${API_BASE_URL}/option-templates/${templateId}/archive`, {});
  }

  restoreCategoryOptionTemplate(templateId: number): Observable<CategoryOptionTemplate> {
    return this.http.put<CategoryOptionTemplate>(`${API_BASE_URL}/option-templates/${templateId}/restore`, {});
  }

  createCategoryOptionTemplate(
    data: CreateOptionGroupInput & { category_id: number }
  ): Observable<CategoryOptionTemplate> {
    return this.http.post<CategoryOptionTemplate>(`${API_BASE_URL}/option-templates`, data);
  }

  updateCategoryOptionTemplate(
    templateId: number,
    data: {
      category_id?: number;
      name?: string;
      description?: string;
      selection_type?: 'single' | 'multi';
      min_select?: number;
      max_select?: number;
      is_required?: boolean;
      is_enabled?: boolean;
      sort_order?: number;
    }
  ): Observable<CategoryOptionTemplate> {
    return this.http.put<CategoryOptionTemplate>(`${API_BASE_URL}/option-templates/${templateId}`, data);
  }

  deleteCategoryOptionTemplate(templateId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/option-templates/${templateId}`);
  }

  addCategoryOptionTemplateChoice(
    templateId: number,
    data: { name: string; price_delta: number; is_default?: boolean; is_enabled?: boolean; sort_order?: number }
  ): Observable<CategoryOptionTemplateChoice> {
    return this.http.post<CategoryOptionTemplateChoice>(
      `${API_BASE_URL}/option-templates/${templateId}/choices`,
      data
    );
  }

  updateCategoryOptionTemplateChoice(
    choiceId: number,
    data: { name?: string; price_delta?: number; is_default?: boolean; is_enabled?: boolean; sort_order?: number }
  ): Observable<CategoryOptionTemplateChoice> {
    return this.http.put<CategoryOptionTemplateChoice>(`${API_BASE_URL}/template-choices/${choiceId}`, data);
  }

  deleteCategoryOptionTemplateChoice(choiceId: number): Observable<unknown> {
    return this.http.delete(`${API_BASE_URL}/template-choices/${choiceId}`);
  }

  applyOptionTemplateToMenuItem(menuItemId: number, templateId: number): Observable<MenuOptionGroup> {
    return this.http.post<MenuOptionGroup>(
      `${API_BASE_URL}/menu-items/${menuItemId}/option-groups/from-template/${templateId}`,
      {}
    );
  }
}
