import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';

import { MenuService } from '../../core/menu.service';
import { SERVER_BASE_URL, resolveMediaUrl } from '../../core/api-config';
import { ToastService } from '../../core/toast.service';
import {
  Category,
  CategoryOptionTemplate,
  MenuItem,
  MenuOptionGroup,
  OptionSelectionType
} from '../../core/models';

interface ConfirmState {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface DraftChoiceRow {
  name: string;
  price_delta: number | null;
  is_default: boolean;
}

// แถวตัวเลือกย่อยในฟอร์มกลุ่มตัวเลือก (ต่างจาก DraftChoiceRow เฉยๆ ตรงที่ต้องรู้ว่าแถวนี้คือตัวเลือกที่มีอยู่แล้ว
// (มี id) หรือเป็นแถวใหม่ที่ยังไม่ได้บันทึก — ใช้ตอน diff ว่าต้อง add/update/delete ตัวเลือกไหนบ้างตอนกดบันทึก
interface GroupChoiceRow extends DraftChoiceRow {
  id?: number;
  is_enabled: boolean;
}

// เทมเพลตด่วน (client-side ล้วนๆ) — แค่ช่วย autofill ชื่อกลุ่ม+ตัวเลือกย่อยตอนสร้างกลุ่มตัวเลือกใหม่
// ไม่ใช่ของที่บันทึกไว้ที่ backend (นั่นคือ "ค่าเริ่มต้นตัวเลือกระดับหมวดหมู่" ที่แท็บตัวเลือกเสริมจัดการแยกอยู่แล้ว)
interface QuickOptionTemplate {
  key: string;
  label: string;
  choices: string[];
}

const QUICK_OPTION_TEMPLATES: QuickOptionTemplate[] = [
  { key: 'sweetness', label: 'ระดับความหวาน', choices: ['หวาน 0%', 'หวาน 25%', 'หวาน 50%', 'หวาน 100%'] },
  { key: 'temperature', label: 'อุณหภูมิ', choices: ['ร้อน', 'เย็น', 'ปั่น'] },
  { key: 'topping', label: 'ท็อปปิ้ง', choices: ['ไข่มุก', 'วุ้นมะพร้าว', 'เฉาก๊วย'] },
  { key: 'cooking_note', label: 'หมายเหตุการปรุง', choices: ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดปกติ', 'เผ็ดมาก'] },
  { key: 'size', label: 'ขนาด S/M/L', choices: ['S', 'M', 'L'] },
  { key: 'milk_alt', label: 'นมทางเลือก', choices: ['นมสด', 'นมโอ๊ต', 'นมอัลมอนด์', 'ไม่ใส่นม'] }
];

// สีให้เลือกไวๆ ตอนสร้าง/แก้ไขหมวดหมู่ (แอดมินพิมพ์ hex เองก็ได้ ปุ่มพวกนี้แค่ช่วยความเร็ว)
const CATEGORY_COLOR_SWATCHES = [
  '#4f46e5', '#0ea5e9', '#16a34a', '#f59e0b', '#ef4444', '#ec4899', '#6b7280'
];

type AdminTab = 'items' | 'categories' | 'options' | 'archived';

// มุมมองแบบเต็มหน้า (แทนที่เนื้อหาแท็บทั้งหมด) — ใช้กับฟอร์มเพิ่ม/แก้ไขหมวดหมู่, เมนู, กลุ่มตัวเลือก
type PageView =
  | { kind: 'none' }
  | { kind: 'category-form'; editingId: number | null }
  | { kind: 'item-form'; editingId: number | null }
  | { kind: 'option-group-form'; menuItemId: number; editingGroupId: number | null }
  | { kind: 'template-form'; editingId: number | null };

@Component({
  selector: 'app-menu-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './menu-admin.component.html',
  styleUrl: './menu-admin.component.scss'
})
export class MenuAdminComponent implements OnInit {
  private allCategoriesRaw = signal<Category[]>([]);
  private allMenuItemsRaw = signal<MenuItem[]>([]);

  categories = computed(() => this.allCategoriesRaw().filter((c) => !c.is_archived));
  archivedCategories = computed(() => this.allCategoriesRaw().filter((c) => c.is_archived));
  menuItems = computed(() => this.allMenuItemsRaw().filter((i) => !i.is_archived));
  archivedMenuItems = computed(() => this.allMenuItemsRaw().filter((i) => i.is_archived));

  serverBaseUrl = SERVER_BASE_URL;
  mediaUrl = resolveMediaUrl;
  categoryColorSwatches = CATEGORY_COLOR_SWATCHES;
  quickOptionTemplates = QUICK_OPTION_TEMPLATES;

  // ---- แท็บบนสุดของหน้า ----
  activeTab = signal<AdminTab>('items');
  view = signal<PageView>({ kind: 'none' });

  // ตัวกรองหมวดหมู่ที่แท็บ "เมนูสินค้า" — null = ทุกหมวดหมู่
  itemsFilterCategoryId = signal<number | null>(null);

  // ช่องค้นหาเมนู (ดีไซน์ 7c) — ค้นจากชื่อเมนู
  itemsSearchQuery = signal('');

  filteredMenuItemsForAdmin = computed(() => {
    const catId = this.itemsFilterCategoryId();
    const query = this.itemsSearchQuery().trim().toLowerCase();
    let items = this.menuItems();
    if (catId) items = items.filter((m) => m.category_id === catId);
    if (query) items = items.filter((m) => m.name.toLowerCase().includes(query));
    return items;
  });

  switchTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    this.view.set({ kind: 'none' });
    if (tab === 'options') {
      this.loadAllTemplates();
    }
    if (tab === 'archived') {
      this.loadArchivedTemplates();
    }
  }

  // ปุ่มที่ยกมาจากดีไซน์ต้นแบบแต่ระบบนี้ยังไม่รองรับจริง (เช่น นำเข้า Excel)
  showNotImplemented(feature: string): void {
    this.toastService.info(`ฟีเจอร์"${feature}"ยังไม่เปิดใช้งานในระบบนี้`);
  }

  // ---- สถานะ "กำลังทำงาน" ของปุ่มรายแถว (แก้ไข/เก็บ/กู้คืน/ลบ/สลับ/เรียงลำดับ) ----
  // ใช้ set ของ key ข้อความ (เช่น "cat-5", "item-avail-12") กันปุ่มไหนกำลังส่งคำขออยู่ ผูก [disabled] ที่ปุ่มนั้น
  // โดยเฉพาะ ไม่กระทบปุ่มแถวอื่น
  private busyKeys = signal<Set<string>>(new Set());

  isBusy(key: string): boolean {
    return this.busyKeys().has(key);
  }

  private setBusy(key: string, busy: boolean): void {
    const next = new Set(this.busyKeys());
    if (busy) next.add(key);
    else next.delete(key);
    this.busyKeys.set(next);
  }

  // ---- สถานะ "กำลังบันทึก" ของฟอร์มเต็มหน้าแต่ละแบบ — ผูกกับปุ่ม "บันทึก" หลักของแต่ละฟอร์ม ----
  savingCategory = signal(false);
  savingItem = signal(false);
  savingGroup = signal(false);
  savingTemplate = signal(false);

  // ---- popup ยืนยัน (ใช้ร่วมกันทั้งลบหมวดหมู่ / ลบเมนู / เก็บถาวร / กู้คืน) ----
  confirmDialog = signal<ConfirmState | null>(null);

  askConfirm(message: string, onConfirm: () => void, confirmLabel = 'ยืนยัน'): void {
    this.confirmDialog.set({ message, confirmLabel, onConfirm });
  }

  closeConfirm(): void {
    this.confirmDialog.set(null);
  }

  runConfirm(): void {
    const dialog = this.confirmDialog();
    if (!dialog) return;
    dialog.onConfirm();
    this.confirmDialog.set(null);
  }

  constructor(
    private menuService: MenuService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.menuService.getCategories(true).subscribe({
      next: (cats) => {
        this.allCategoriesRaw.set(cats);
        if (!this.itemFormCategoryId && this.categories().length > 0) {
          this.itemFormCategoryId = this.categories()[0].id;
        }
      },
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดหมวดหมู่ไม่สำเร็จ')
    });

    this.menuService.getMenuItems(undefined, true).subscribe({
      next: (items) => this.allMenuItemsRaw.set(items),
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดเมนูไม่สำเร็จ')
    });
  }

  categoryName(id: number): string {
    return this.allCategoriesRaw().find((c) => c.id === id)?.name ?? '-';
  }

  categoryById(id: number): Category | undefined {
    return this.allCategoriesRaw().find((c) => c.id === id);
  }

  // มีเมนูอยู่ในหมวดนี้หรือไม่ — ใช้กันไม่ให้ลบ/เก็บหมวดหมู่ทิ้งทั้งที่ยังมีเมนูผูกอยู่
  categoryHasItems(categoryId: number): boolean {
    return this.menuItems().some((item) => item.category_id === categoryId);
  }

  itemCountLabel(categoryId: number): string {
    const count = this.menuItems().filter((item) => item.category_id === categoryId).length;
    return `${count} เมนู`;
  }

  // =========================================================================
  // ---- หมวดหมู่: full-page form (เพิ่ม/แก้ไข) ----
  // =========================================================================

  categoryFormName = '';
  categoryFormDescription = '';
  categoryFormColor = CATEGORY_COLOR_SWATCHES[0];
  categoryFormSortOrder = 0;
  categoryFormEnabled = true;

  openAddCategoryForm(): void {
    this.categoryFormName = '';
    this.categoryFormDescription = '';
    this.categoryFormColor = CATEGORY_COLOR_SWATCHES[0];
    this.categoryFormSortOrder = this.categories().length + 1;
    this.categoryFormEnabled = true;
    this.view.set({ kind: 'category-form', editingId: null });
  }

  openEditCategoryForm(cat: Category): void {
    this.categoryFormName = cat.name;
    this.categoryFormDescription = cat.description ?? '';
    this.categoryFormColor = cat.color || CATEGORY_COLOR_SWATCHES[0];
    this.categoryFormSortOrder = cat.sort_order;
    this.categoryFormEnabled = cat.is_enabled;
    this.view.set({ kind: 'category-form', editingId: cat.id });
  }

  closeCategoryForm(): void {
    this.view.set({ kind: 'none' });
  }

  saveCategoryForm(): void {
    if (this.savingCategory()) return;
    if (!this.categoryFormName.trim()) {
      this.toastService.error('กรอกชื่อหมวดหมู่');
      return;
    }
    const view = this.view();
    const payload: Partial<Category> = {
      name: this.categoryFormName.trim(),
      description: this.categoryFormDescription.trim(),
      color: this.categoryFormColor,
      sort_order: this.categoryFormSortOrder,
      is_enabled: this.categoryFormEnabled
    };

    this.savingCategory.set(true);
    if (view.kind === 'category-form' && view.editingId !== null) {
      this.menuService.updateCategory(view.editingId, payload).subscribe({
        next: () => {
          this.savingCategory.set(false);
          this.closeCategoryForm();
          this.reload();
        },
        error: (err) => {
          this.savingCategory.set(false);
          this.toastService.error(err?.error?.error ?? 'แก้ไขหมวดหมู่ไม่สำเร็จ');
        }
      });
    } else {
      this.menuService.createCategory(payload).subscribe({
        next: () => {
          this.savingCategory.set(false);
          this.closeCategoryForm();
          this.reload();
        },
        error: (err) => {
          this.savingCategory.set(false);
          this.toastService.error(err?.error?.error ?? 'เพิ่มหมวดหมู่ไม่สำเร็จ');
        }
      });
    }
  }

  deleteCategory(id: number): void {
    if (this.categoryHasItems(id)) {
      this.toastService.error('ลบหมวดหมู่นี้ไม่ได้ เพราะยังมีเมนูอยู่ในหมวดนี้ กรุณาย้ายหรือลบเมนูออกก่อน');
      return;
    }
    const cat = this.categories().find((c) => c.id === id);
    this.askConfirm(`ยืนยันลบหมวดหมู่ "${cat?.name ?? ''}"? การลบไม่สามารถย้อนกลับได้`, () => {
      const key = `cat-${id}`;
      this.setBusy(key, true);
      this.menuService.deleteCategory(id).subscribe({
        next: () => {
          this.setBusy(key, false);
          this.reload();
        },
        error: (err) => {
          this.setBusy(key, false);
          this.toastService.error(err?.error?.error ?? 'ลบหมวดหมู่ไม่สำเร็จ');
        }
      });
    });
  }

  archiveCategory(cat: Category): void {
    if (this.categoryHasItems(cat.id)) {
      this.toastService.error('เก็บหมวดหมู่นี้ไม่ได้ เพราะยังมีเมนูอยู่ในหมวดนี้ กรุณาย้ายหรือเก็บเมนูออกก่อน');
      return;
    }
    this.askConfirm(`เก็บหมวดหมู่ "${cat.name}" เข้าคลังเก็บถาวร? กู้คืนได้ทีหลังที่แท็บ "เมนูที่เก็บถาวร"`, () => {
      const key = `cat-${cat.id}`;
      this.setBusy(key, true);
      this.menuService.archiveCategory(cat.id).subscribe({
        next: () => {
          this.setBusy(key, false);
          this.reload();
        },
        error: (err) => {
          this.setBusy(key, false);
          this.toastService.error(err?.error?.error ?? 'เก็บหมวดหมู่ไม่สำเร็จ');
        }
      });
    }, 'เก็บถาวร');
  }

  restoreCategory(cat: Category): void {
    const key = `cat-${cat.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.menuService.restoreCategory(cat.id).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.reload();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'กู้คืนหมวดหมู่ไม่สำเร็จ');
      }
    });
  }

  // เรียงลำดับหมวดหมู่ขึ้น/ลง — สลับค่า sort_order กับหมวดข้างเคียงแล้วบันทึกทั้งคู่
  moveCategory(cat: Category, direction: -1 | 1): void {
    const key = `cat-move-${cat.id}`;
    if (this.isBusy(key)) return;

    const list = [...this.categories()].sort((a, b) => a.sort_order - b.sort_order);
    const index = list.findIndex((c) => c.id === cat.id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= list.length) return;

    const other = list[targetIndex];
    const catSort = cat.sort_order;
    const otherSort = other.sort_order;

    this.setBusy(key, true);
    this.menuService
      .updateCategory(cat.id, { ...cat, sort_order: otherSort })
      .subscribe(() => {
        this.menuService.updateCategory(other.id, { ...other, sort_order: catSort }).subscribe({
          next: () => {
            this.setBusy(key, false);
            this.reload();
          },
          error: (err) => {
            this.setBusy(key, false);
            this.toastService.error(err?.error?.error ?? 'จัดลำดับไม่สำเร็จ');
          }
        });
      });
  }

  // =========================================================================
  // ---- เมนู: full-page form (เพิ่ม/แก้ไข) ----
  // =========================================================================

  itemFormName = '';
  itemFormPrice: number | null = null;
  itemFormCategoryId: number | null = null;
  itemFormFeatured = false;
  itemFormBestseller = false;
  itemFormTrackStock = false;
  itemFormEditingItem = signal<MenuItem | null>(null);
  itemFormImagePreviewUrl = signal<string | null>(null);
  itemFormPendingImageFile: File | null = null;
  itemFormUploadingImage = signal(false);
  // ค่าเริ่มต้นตัวเลือกของหมวดหมู่ที่เมนูนี้สังกัดอยู่ — โชว์เป็นทางลัดในหน้าแก้ไขเมนู
  itemFormCategoryTemplates = signal<CategoryOptionTemplate[]>([]);

  openAddItemForm(): void {
    this.itemFormName = '';
    this.itemFormPrice = null;
    this.itemFormCategoryId = this.categories()[0]?.id ?? null;
    this.itemFormFeatured = false;
    this.itemFormBestseller = false;
    this.itemFormTrackStock = false;
    this.itemFormEditingItem.set(null);
    this.itemFormImagePreviewUrl.set(null);
    this.itemFormPendingImageFile = null;
    this.itemFormCategoryTemplates.set([]);
    this.view.set({ kind: 'item-form', editingId: null });
  }

  openEditItemForm(item: MenuItem): void {
    this.itemFormName = item.name;
    this.itemFormPrice = item.price;
    this.itemFormCategoryId = item.category_id;
    this.itemFormFeatured = item.is_featured;
    this.itemFormBestseller = item.is_bestseller;
    this.itemFormTrackStock = item.track_stock;
    this.itemFormEditingItem.set(item);
    this.itemFormImagePreviewUrl.set(this.mediaUrl(item.image_path));
    this.itemFormPendingImageFile = null;
    this.menuService.getCategoryOptionTemplates(item.category_id).subscribe({
      next: (templates) => this.itemFormCategoryTemplates.set(templates),
      error: () => this.itemFormCategoryTemplates.set([])
    });
    this.view.set({ kind: 'item-form', editingId: item.id });
  }

  closeItemForm(): void {
    this.view.set({ kind: 'none' });
  }

  onItemImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const editingItem = this.itemFormEditingItem();
    if (editingItem) {
      // เมนูมีอยู่แล้ว อัปโหลดได้ทันที
      this.itemFormUploadingImage.set(true);
      this.menuService.uploadMenuItemImage(editingItem.id, file).subscribe({
        next: (updated) => {
          this.itemFormUploadingImage.set(false);
          this.itemFormImagePreviewUrl.set(this.mediaUrl(updated.image_path));
          this.itemFormEditingItem.set(updated);
          this.reload();
        },
        error: (err) => {
          this.itemFormUploadingImage.set(false);
          this.toastService.error(err?.error?.error ?? 'อัปโหลดรูปไม่สำเร็จ');
        }
      });
    } else {
      // เมนูใหม่ยังไม่มี id — เก็บไฟล์ไว้ก่อน จะอัปโหลดจริงหลังบันทึกเมนูสำเร็จ
      this.itemFormPendingImageFile = file;
      this.itemFormImagePreviewUrl.set(URL.createObjectURL(file));
    }
  }

  removeItemImage(): void {
    const editingItem = this.itemFormEditingItem();
    if (editingItem && editingItem.image_path) {
      this.itemFormUploadingImage.set(true);
      this.menuService.deleteMenuItemImage(editingItem.id).subscribe({
        next: (updated) => {
          this.itemFormUploadingImage.set(false);
          this.itemFormImagePreviewUrl.set(null);
          this.itemFormEditingItem.set(updated);
          this.reload();
        },
        error: (err) => {
          this.itemFormUploadingImage.set(false);
          this.toastService.error(err?.error?.error ?? 'ลบรูปไม่สำเร็จ');
        }
      });
    } else {
      this.itemFormPendingImageFile = null;
      this.itemFormImagePreviewUrl.set(null);
    }
  }

  toggleAvailable(item: MenuItem): void {
    const key = `item-avail-${item.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.menuService.updateMenuItem(item.id, { ...item, is_available: !item.is_available }).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.reload();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'แก้ไขสถานะเมนูไม่สำเร็จ');
      }
    });
  }

  saveItemForm(): void {
    if (this.savingItem()) return;
    if (
      !this.itemFormName.trim() ||
      !this.itemFormCategoryId ||
      !this.itemFormPrice ||
      this.itemFormPrice <= 0
    ) {
      this.toastService.error('กรอกชื่อเมนู ราคา และหมวดหมู่ให้ครบ');
      return;
    }

    const editingItem = this.itemFormEditingItem();
    const payload: Partial<MenuItem> = {
      name: this.itemFormName.trim(),
      price: this.itemFormPrice,
      category_id: this.itemFormCategoryId,
      is_available: editingItem ? editingItem.is_available : true,
      is_featured: this.itemFormFeatured,
      is_bestseller: this.itemFormBestseller,
      track_stock: this.itemFormTrackStock
    };

    this.savingItem.set(true);
    if (editingItem) {
      this.menuService.updateMenuItem(editingItem.id, payload).subscribe({
        next: () => {
          this.savingItem.set(false);
          this.closeItemForm();
          this.reload();
        },
        error: (err) => {
          this.savingItem.set(false);
          this.toastService.error(err?.error?.error ?? 'แก้ไขเมนูไม่สำเร็จ');
        }
      });
    } else {
      this.menuService.createMenuItem(payload).subscribe({
        next: (created) => {
          if (this.itemFormPendingImageFile) {
            this.menuService.uploadMenuItemImage(created.id, this.itemFormPendingImageFile).subscribe({
              next: () => {
                this.savingItem.set(false);
                this.closeItemForm();
                this.reload();
              },
              error: () => {
                this.savingItem.set(false);
                this.toastService.warning('เพิ่มเมนูสำเร็จ แต่อัปโหลดรูปไม่สำเร็จ ลองแก้ไขเมนูนี้เพื่ออัปโหลดใหม่ได้');
                this.closeItemForm();
                this.reload();
              }
            });
          } else {
            this.savingItem.set(false);
            this.closeItemForm();
            this.reload();
          }
        },
        error: (err) => {
          this.savingItem.set(false);
          this.toastService.error(err?.error?.error ?? 'เพิ่มเมนูไม่สำเร็จ');
        }
      });
    }
  }

  confirmDeleteItem(item: MenuItem): void {
    this.askConfirm(`ยืนยันลบเมนู "${item.name}"? การลบไม่สามารถย้อนกลับได้`, () => {
      const key = `item-${item.id}`;
      this.setBusy(key, true);
      this.menuService.deleteMenuItem(item.id).subscribe({
        next: () => {
          this.setBusy(key, false);
          this.reload();
        },
        error: (err) => {
          this.setBusy(key, false);
          this.toastService.error(err?.error?.error ?? 'ลบเมนูไม่สำเร็จ');
        }
      });
    });
  }

  archiveItem(item: MenuItem): void {
    this.askConfirm(`เก็บเมนู "${item.name}" เข้าคลังเก็บถาวร? กู้คืนได้ทีหลังที่แท็บ "เมนูที่เก็บถาวร"`, () => {
      const key = `item-${item.id}`;
      this.setBusy(key, true);
      this.menuService.archiveMenuItem(item.id).subscribe({
        next: () => {
          this.setBusy(key, false);
          this.reload();
        },
        error: (err) => {
          this.setBusy(key, false);
          this.toastService.error(err?.error?.error ?? 'เก็บเมนูไม่สำเร็จ');
        }
      });
    }, 'เก็บถาวร');
  }

  restoreItem(item: MenuItem): void {
    const key = `item-${item.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.menuService.restoreMenuItem(item.id).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.reload();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'กู้คืนเมนูไม่สำเร็จ');
      }
    });
  }

  // =========================================================================
  // ---- เทมเพลตกลุ่มตัวเลือก "ตัวเลือกเสริม" — การ์ดรวมทุกหมวดหมู่ + popup เพิ่ม/แก้ไข ----
  // =========================================================================

  allTemplates = signal<CategoryOptionTemplate[]>([]);
  archivedTemplates = signal<CategoryOptionTemplate[]>([]);

  loadAllTemplates(): void {
    this.menuService.getAllCategoryOptionTemplates().subscribe({
      next: (templates) => this.allTemplates.set(templates),
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดตัวเลือกเสริมไม่สำเร็จ')
    });
  }

  loadArchivedTemplates(): void {
    this.menuService.getArchivedCategoryOptionTemplates().subscribe({
      next: (templates) => this.archivedTemplates.set(templates),
      error: (err) => this.toastService.error(err?.error?.error ?? 'โหลดตัวเลือกเสริมที่เก็บถาวรไม่สำเร็จ')
    });
  }

  templateSelectionLabel(tpl: CategoryOptionTemplate): string {
    const kind = tpl.selection_type === 'multi' ? 'เลือกได้หลายอย่าง' : 'เลือกได้อย่างเดียว';
    return tpl.is_required ? `${kind} · บังคับเลือก` : kind;
  }

  // ---- full-page: เพิ่ม/แก้ไขกลุ่มตัวเลือกเสริม (ฟิลด์เหมือน "เพิ่มกลุ่มตัวเลือก" ของเมนูทุกประการ) ----
  // ใช้ view() แบบเดียวกับ category-form/item-form ให้หน้าตาเป็นแบบเดียวกันทั้งระบบ (ไม่ใช่ popup แล้ว)

  templateFormEditingId: number | null = null;
  templateFormCategoryId: number | null = null;
  templateFormName = '';
  templateFormDescription = '';
  templateFormSelectionType: OptionSelectionType = 'single';
  templateFormMinSelect = 0;
  templateFormMaxSelect = 1;
  templateFormRequired = false;
  templateFormEnabled = true;
  templateFormChoices: GroupChoiceRow[] = [{ name: '', price_delta: 0, is_default: false, is_enabled: true }];
  templateFormActiveTemplateKey: string | null = null;
  private templateFormOriginalChoiceIds: number[] = [];

  openAddTemplateForm(): void {
    this.templateFormEditingId = null;
    this.templateFormCategoryId = this.categories()[0]?.id ?? null;
    this.templateFormName = '';
    this.templateFormDescription = '';
    this.templateFormSelectionType = 'single';
    this.templateFormMinSelect = 0;
    this.templateFormMaxSelect = 1;
    this.templateFormRequired = false;
    this.templateFormEnabled = true;
    this.templateFormChoices = [{ name: '', price_delta: 0, is_default: false, is_enabled: true }];
    this.templateFormOriginalChoiceIds = [];
    this.templateFormActiveTemplateKey = null;
    this.view.set({ kind: 'template-form', editingId: null });
  }

  openEditTemplateForm(tpl: CategoryOptionTemplate): void {
    this.templateFormEditingId = tpl.id;
    this.templateFormCategoryId = tpl.category_id;
    this.templateFormName = tpl.name;
    this.templateFormDescription = tpl.description ?? '';
    this.templateFormSelectionType = tpl.selection_type ?? 'single';
    this.templateFormMinSelect = tpl.min_select ?? 0;
    this.templateFormMaxSelect = tpl.max_select ?? 1;
    this.templateFormRequired = tpl.is_required;
    this.templateFormEnabled = tpl.is_enabled ?? true;
    this.templateFormChoices = (tpl.choices ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      price_delta: c.price_delta,
      is_default: c.is_default,
      is_enabled: c.is_enabled
    }));
    this.templateFormOriginalChoiceIds = (tpl.choices ?? []).map((c) => c.id);
    if (this.templateFormChoices.length === 0) {
      this.templateFormChoices = [{ name: '', price_delta: 0, is_default: false, is_enabled: true }];
    }
    this.templateFormActiveTemplateKey = null;
    this.view.set({ kind: 'template-form', editingId: tpl.id });
  }

  closeTemplateForm(): void {
    this.view.set({ kind: 'none' });
  }

  applyQuickOptionTemplateToTemplateForm(tpl: QuickOptionTemplate): void {
    this.templateFormActiveTemplateKey = tpl.key;
    if (!this.templateFormName.trim()) {
      this.templateFormName = tpl.label;
    }
    this.templateFormChoices = tpl.choices.map((name) => ({ name, price_delta: 0, is_default: false, is_enabled: true }));
  }

  addTemplateFormChoiceRow(): void {
    this.templateFormChoices.push({ name: '', price_delta: 0, is_default: false, is_enabled: true });
  }

  removeTemplateFormChoiceRow(index: number): void {
    if (this.templateFormChoices.length <= 1) return;
    this.templateFormChoices.splice(index, 1);
  }

  // สลับลำดับตัวเลือกย่อย (ก่อน/หลัง) — ลำดับในตารางนี้คือลำดับที่จะโชว์เป็น chip ในการ์ดและตอนนำไปใช้กับเมนู
  moveTemplateFormChoiceRow(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.templateFormChoices.length) return;
    const rows = this.templateFormChoices;
    [rows[index], rows[target]] = [rows[target], rows[index]];
  }

  toggleTemplateFormChoiceDefault(index: number): void {
    const row = this.templateFormChoices[index];
    const newValue = !row.is_default;
    if (this.templateFormSelectionType === 'single' && newValue) {
      this.templateFormChoices.forEach((c) => (c.is_default = false));
    }
    row.is_default = newValue;
  }

  toggleTemplateFormChoiceEnabled(index: number): void {
    const row = this.templateFormChoices[index];
    row.is_enabled = !row.is_enabled;
  }

  saveTemplateForm(): void {
    if (this.savingTemplate()) return;
    const name = this.templateFormName.trim();
    const rows = this.templateFormChoices.filter((c) => c.name.trim().length > 0);

    if (!name || !this.templateFormCategoryId || rows.length === 0) {
      this.toastService.error('กรอกชื่อ หมวดหมู่ และตัวเลือกย่อยอย่างน้อย 1 รายการ');
      return;
    }

    const templateFields = {
      category_id: this.templateFormCategoryId,
      name,
      description: this.templateFormDescription.trim(),
      selection_type: this.templateFormSelectionType,
      min_select: this.templateFormMinSelect,
      max_select: this.templateFormMaxSelect,
      is_required: this.templateFormRequired
    };

    this.savingTemplate.set(true);
    if (this.templateFormEditingId === null) {
      // เทมเพลตใหม่ — สร้างพร้อมตัวเลือกย่อยทั้งหมดในคำขอเดียว (endpoint รองรับอยู่แล้ว)
      this.menuService
        .createCategoryOptionTemplate({
          ...templateFields,
          choices: rows.map((c) => ({ name: c.name.trim(), price_delta: c.price_delta ?? 0, is_default: c.is_default }))
        })
        .subscribe({
          next: () => {
            this.savingTemplate.set(false);
            this.toastService.success(`บันทึก "${name}" แล้ว`);
            this.closeTemplateForm();
            this.loadAllTemplates();
          },
          error: (err) => {
            this.savingTemplate.set(false);
            this.toastService.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
          }
        });
      return;
    }

    // เทมเพลตที่มีอยู่แล้ว — บันทึกฟิลด์หลักก่อน แล้ว diff ตารางตัวเลือกเหมือน saveOptionGroupForm
    // (มี id เดิม=update, ไม่มี id=add, id เดิมที่หายไปจากตาราง=delete)
    const templateId = this.templateFormEditingId;
    const rowIds = new Set(rows.map((r) => r.id).filter((id): id is number => id !== undefined));
    const removedIds = this.templateFormOriginalChoiceIds.filter((id) => !rowIds.has(id));

    const tasks: Observable<unknown>[] = [
      this.menuService.updateCategoryOptionTemplate(templateId, {
        ...templateFields,
        is_enabled: this.templateFormEnabled
      })
    ];
    rows.forEach((row, index) => {
      if (row.id !== undefined) {
        tasks.push(
          this.menuService.updateCategoryOptionTemplateChoice(row.id, {
            name: row.name.trim(),
            price_delta: row.price_delta ?? 0,
            is_default: row.is_default,
            is_enabled: row.is_enabled,
            sort_order: index
          })
        );
      } else {
        tasks.push(
          this.menuService.addCategoryOptionTemplateChoice(templateId, {
            name: row.name.trim(),
            price_delta: row.price_delta ?? 0,
            is_default: row.is_default,
            sort_order: index
          })
        );
      }
    });
    for (const id of removedIds) {
      tasks.push(this.menuService.deleteCategoryOptionTemplateChoice(id));
    }

    forkJoin(tasks).subscribe({
      next: () => {
        this.savingTemplate.set(false);
        this.toastService.success(`บันทึก "${name}" แล้ว`);
        this.closeTemplateForm();
        this.loadAllTemplates();
      },
      error: (err) => {
        this.savingTemplate.set(false);
        this.toastService.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    });
  }

  confirmDeleteTemplate(tpl: CategoryOptionTemplate): void {
    this.askConfirm(`ยืนยันลบ "${tpl.name}"? การลบไม่สามารถย้อนกลับได้`, () => {
      const key = `tpl-${tpl.id}`;
      this.setBusy(key, true);
      this.menuService.deleteCategoryOptionTemplate(tpl.id).subscribe({
        next: () => {
          this.setBusy(key, false);
          this.toastService.success('ลบแล้ว');
          this.loadAllTemplates();
        },
        error: (err) => {
          this.setBusy(key, false);
          this.toastService.error(err?.error?.error ?? 'ลบไม่สำเร็จ');
        }
      });
    });
  }

  // เก็บกลุ่มตัวเลือกไว้ (ย้ายไปแท็บ "เก็บถาวร") — ต่างจากลบตรงที่กู้คืนได้ภายหลัง
  archiveTemplate(tpl: CategoryOptionTemplate): void {
    const key = `tpl-${tpl.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.menuService.archiveCategoryOptionTemplate(tpl.id).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.toastService.success(`เก็บ "${tpl.name}" แล้ว`);
        this.loadAllTemplates();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'เก็บไม่สำเร็จ');
      }
    });
  }

  restoreTemplate(tpl: CategoryOptionTemplate): void {
    const key = `tpl-${tpl.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.menuService.restoreCategoryOptionTemplate(tpl.id).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.toastService.success(`กู้คืน "${tpl.name}" แล้ว`);
        this.loadArchivedTemplates();
        this.loadAllTemplates();
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'กู้คืนไม่สำเร็จ');
      }
    });
  }

  // ใช้ค่าเริ่มต้นของหมวดหมู่กับเมนูที่กำลังแก้ไขอยู่ (เรียกจากหน้าฟอร์มเมนู)
  applyTemplateToCurrentItem(template: CategoryOptionTemplate): void {
    const item = this.itemFormEditingItem();
    if (!item) return;
    const key = `apply-tpl-${template.id}`;
    if (this.isBusy(key)) return;
    this.setBusy(key, true);
    this.menuService.applyOptionTemplateToMenuItem(item.id, template.id).subscribe({
      next: () => {
        this.setBusy(key, false);
        this.toastService.success(`ใช้ค่าเริ่มต้น "${template.name}" แล้ว`);
        this.reloadEditingItem(item.id);
      },
      error: (err) => {
        this.setBusy(key, false);
        this.toastService.error(err?.error?.error ?? 'ใช้ค่าเริ่มต้นไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    });
  }

  private reloadEditingItem(itemId: number): void {
    this.menuService.getMenuItems(undefined, true).subscribe({
      next: (items) => {
        this.allMenuItemsRaw.set(items);
        const updated = items.find((i) => i.id === itemId);
        if (updated) this.itemFormEditingItem.set(updated);
      }
    });
  }

  // =========================================================================
  // ---- กลุ่มตัวเลือกของเมนู: full-page form (เพิ่ม/แก้ไข) — เปิดจากหน้าแก้ไขเมนู ----
  // =========================================================================

  groupFormName = '';
  groupFormDescription = '';
  groupFormSelectionType: OptionSelectionType = 'single';
  groupFormMinSelect = 0;
  groupFormMaxSelect = 1;
  groupFormRequired = false;
  groupFormEnabled = true;
  groupFormSortOrder = 0;
  groupFormChoices: GroupChoiceRow[] = [{ name: '', price_delta: 0, is_default: false, is_enabled: true }];
  groupFormActiveTemplateKey: string | null = null;
  // เก็บ id ของตัวเลือกย่อยตอนเปิดฟอร์มแก้ไข ไว้ diff ตอนบันทึกว่าแถวไหนถูกลบออกไปจากตาราง
  private groupFormOriginalChoiceIds: number[] = [];

  openAddOptionGroupForm(item: MenuItem): void {
    this.groupFormName = '';
    this.groupFormDescription = '';
    this.groupFormSelectionType = 'single';
    this.groupFormMinSelect = 0;
    this.groupFormMaxSelect = 1;
    this.groupFormRequired = false;
    this.groupFormEnabled = true;
    this.groupFormSortOrder = item.option_groups?.length ?? 0;
    this.groupFormChoices = [{ name: '', price_delta: 0, is_default: false, is_enabled: true }];
    this.groupFormOriginalChoiceIds = [];
    this.groupFormActiveTemplateKey = null;
    this.view.set({ kind: 'option-group-form', menuItemId: item.id, editingGroupId: null });
  }

  openEditOptionGroupForm(item: MenuItem, group: MenuOptionGroup): void {
    this.groupFormName = group.name;
    this.groupFormDescription = group.description ?? '';
    this.groupFormSelectionType = group.selection_type ?? 'single';
    this.groupFormMinSelect = group.min_select ?? 0;
    this.groupFormMaxSelect = group.max_select ?? 1;
    this.groupFormRequired = group.is_required;
    this.groupFormEnabled = group.is_enabled ?? true;
    this.groupFormSortOrder = group.sort_order;
    this.groupFormChoices = (group.choices ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      price_delta: c.price_delta,
      is_default: c.is_default,
      is_enabled: c.is_enabled
    }));
    this.groupFormOriginalChoiceIds = (group.choices ?? []).map((c) => c.id);
    if (this.groupFormChoices.length === 0) {
      this.groupFormChoices = [{ name: '', price_delta: 0, is_default: false, is_enabled: true }];
    }
    this.groupFormActiveTemplateKey = null;
    this.view.set({ kind: 'option-group-form', menuItemId: item.id, editingGroupId: group.id });
  }

  closeOptionGroupForm(): void {
    const v = this.view();
    if (v.kind === 'option-group-form') {
      this.view.set({ kind: 'item-form', editingId: v.menuItemId });
    } else {
      this.view.set({ kind: 'none' });
    }
  }

  applyQuickOptionTemplate(tpl: QuickOptionTemplate): void {
    this.groupFormActiveTemplateKey = tpl.key;
    if (!this.groupFormName.trim()) {
      this.groupFormName = tpl.label;
    }
    // เทมเพลตด่วนแทนที่ตารางตัวเลือกทั้งหมดด้วยชุดใหม่ (แถวเดิมที่มี id จะถูกลบไปตอนบันทึก เพราะไม่อยู่ใน draft แล้ว)
    this.groupFormChoices = tpl.choices.map((name) => ({ name, price_delta: 0, is_default: false, is_enabled: true }));
  }

  addGroupFormChoiceRow(): void {
    this.groupFormChoices.push({ name: '', price_delta: 0, is_default: false, is_enabled: true });
  }

  removeGroupFormChoiceRow(index: number): void {
    if (this.groupFormChoices.length <= 1) return;
    this.groupFormChoices.splice(index, 1);
  }

  // สลับลำดับตัวเลือกย่อย (ก่อน/หลัง) — เหมือน moveTemplateFormChoiceRow แต่ใช้กับฟอร์ม "เพิ่มกลุ่มตัวเลือก" ของเมนู
  moveGroupFormChoiceRow(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.groupFormChoices.length) return;
    const rows = this.groupFormChoices;
    [rows[index], rows[target]] = [rows[target], rows[index]];
  }

  // ตัวเลือก "เริ่มต้น" ถ้าเป็นแบบเลือกได้อย่างเดียว (single) ให้เลือกได้แค่แถวเดียว — ติ๊กแถวใหม่แล้วเคลียร์แถวอื่น
  toggleGroupFormChoiceDefault(index: number): void {
    const row = this.groupFormChoices[index];
    const newValue = !row.is_default;
    if (this.groupFormSelectionType === 'single' && newValue) {
      this.groupFormChoices.forEach((c) => (c.is_default = false));
    }
    row.is_default = newValue;
  }

  toggleGroupFormChoiceEnabled(index: number): void {
    const row = this.groupFormChoices[index];
    row.is_enabled = !row.is_enabled;
  }

  saveOptionGroupForm(): void {
    if (this.savingGroup()) return;
    const name = this.groupFormName.trim();
    const rows = this.groupFormChoices.filter((c) => c.name.trim().length > 0);

    if (!name || rows.length === 0) {
      this.toastService.error('กรอกชื่อกลุ่มตัวเลือก และตัวเลือกย่อยอย่างน้อย 1 รายการ');
      return;
    }

    const v = this.view();
    if (v.kind !== 'option-group-form') return;

    const groupFields = {
      name,
      description: this.groupFormDescription.trim(),
      selection_type: this.groupFormSelectionType,
      min_select: this.groupFormMinSelect,
      max_select: this.groupFormMaxSelect,
      is_required: this.groupFormRequired,
      sort_order: this.groupFormSortOrder
    };

    this.savingGroup.set(true);
    if (v.editingGroupId === null) {
      // กลุ่มใหม่ — สร้างกลุ่ม+ตัวเลือกทั้งหมดในคำขอเดียว (endpoint รองรับอยู่แล้ว)
      this.menuService
        .createOptionGroup(v.menuItemId, {
          ...groupFields,
          choices: rows.map((c) => ({ name: c.name.trim(), price_delta: c.price_delta ?? 0, is_default: c.is_default }))
        })
        .subscribe({
          next: () => {
            this.savingGroup.set(false);
            this.toastService.success(`บันทึก "${name}" แล้ว`);
            this.reloadEditingItem(v.menuItemId);
            this.closeOptionGroupForm();
          },
          error: (err) => {
            this.savingGroup.set(false);
            this.toastService.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
          }
        });
      return;
    }

    // กลุ่มที่มีอยู่แล้ว — บันทึกฟิลด์ของกลุ่มก่อน แล้ว diff ตารางตัวเลือก: มี id เดิม=update, ไม่มี id=add,
    // id เดิมที่หายไปจากตาราง=delete ตามลำดับ ไม่งั้นแก้ตารางตัวเลือกแล้วกดบันทึกจะไม่มีผลอะไรกับตัวเลือกเลย
    const groupId = v.editingGroupId;
    const rowIds = new Set(rows.map((r) => r.id).filter((id): id is number => id !== undefined));
    const removedIds = this.groupFormOriginalChoiceIds.filter((id) => !rowIds.has(id));

    const tasks: Observable<unknown>[] = [
      this.menuService.updateOptionGroup(groupId, { ...groupFields, is_enabled: this.groupFormEnabled })
    ];
    rows.forEach((row, index) => {
      if (row.id !== undefined) {
        tasks.push(
          this.menuService.updateOptionChoice(row.id, {
            name: row.name.trim(),
            price_delta: row.price_delta ?? 0,
            is_default: row.is_default,
            is_enabled: row.is_enabled,
            sort_order: index
          })
        );
      } else {
        tasks.push(
          this.menuService.addOptionChoice(groupId, {
            name: row.name.trim(),
            price_delta: row.price_delta ?? 0,
            is_default: row.is_default,
            sort_order: index
          })
        );
      }
    });
    for (const id of removedIds) {
      tasks.push(this.menuService.deleteOptionChoice(id));
    }

    forkJoin(tasks).subscribe({
      next: () => {
        this.savingGroup.set(false);
        this.toastService.success(`บันทึก "${name}" แล้ว`);
        this.reloadEditingItem(v.menuItemId);
        this.closeOptionGroupForm();
      },
      error: (err) => {
        this.savingGroup.set(false);
        this.toastService.error(err?.error?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    });
  }

  deleteGroup(item: MenuItem, groupId: number): void {
    this.askConfirm('ยืนยันลบกลุ่มตัวเลือกนี้? การลบไม่สามารถย้อนกลับได้', () => {
      const key = `group-${groupId}`;
      this.setBusy(key, true);
      this.menuService.deleteOptionGroup(groupId).subscribe({
        next: () => {
          this.setBusy(key, false);
          this.toastService.success('ลบกลุ่มตัวเลือกแล้ว');
          this.reloadEditingItem(item.id);
        },
        error: (err) => {
          this.setBusy(key, false);
          this.toastService.error(err?.error?.error ?? 'ลบไม่สำเร็จ');
        }
      });
    });
  }
}
