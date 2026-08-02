import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MenuService } from '../../core/menu.service';
import { Category, CategoryOptionTemplate, MenuItem, MenuOptionGroup } from '../../core/models';

interface DraftChoice {
  name: string;
  price_delta: number | null;
}

interface ChoiceDraft {
  name: string;
  price_delta: number | null;
}

interface SaveStatus {
  type: 'success' | 'error';
  text: string;
}

interface ConfirmState {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

// กลุ่มตัวเลือก (เช่น ความหวาน, ไซส์) ที่ร่างไว้ตอนสร้างเมนูใหม่ ยังไม่มี id จริงจนกว่าจะบันทึกเมนูสำเร็จก่อน
interface DraftOptionGroup {
  name: string;
  is_required: boolean;
  choices: DraftChoice[];
}

// สถานที่ทำเริ่มต้นให้เลือกไว้ก่อน แอดมินพิมพ์เพิ่มเองได้จาก popup เพิ่มหมวดหมู่
const DEFAULT_STATIONS = ['ครัว', 'ครัวร้อน', 'บาร์', 'อื่นๆ'];

// ใช้เป็นค่าพิเศษใน <select> สถานที่ทำ เพื่อสลับไปโชว์ช่องพิมพ์ชื่อสถานที่ใหม่เอง
const CUSTOM_STATION_VALUE = '__custom__';

@Component({
  selector: 'app-menu-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './menu-admin.component.html',
  styleUrl: './menu-admin.component.scss'
})
export class MenuAdminComponent implements OnInit {
  categories = signal<Category[]>([]);
  menuItems = signal<MenuItem[]>([]);
  message = signal<string | null>(null);

  // ---- popup ยืนยัน (ใช้ร่วมกันทั้งลบหมวดหมู่ / ลบเมนู / บันทึกแก้ไขเมนู) ----
  confirmDialog = signal<ConfirmState | null>(null);

  // ---- popup เพิ่มหมวดหมู่ ----
  addCategoryModalOpen = signal(false);
  newCategoryName = '';
  newCategoryStation = DEFAULT_STATIONS[0];
  newCategoryStationCustom = '';
  readonly customStationValue = CUSTOM_STATION_VALUE;

  // รวมสถานที่ default กับสถานที่ที่แอดมินเคยพิมพ์เพิ่มเองในหมวดหมู่ที่มีอยู่แล้ว
  stationOptions = computed(() => {
    const set = new Set<string>(DEFAULT_STATIONS);
    for (const cat of this.categories()) {
      if (cat.station) set.add(cat.station);
    }
    return Array.from(set);
  });

  // ---- แก้ไขสถานที่ทำของหมวดหมู่ที่มีอยู่แล้ว (ตั้งใน popup เพิ่มหมวดหมู่ได้แค่ตอนสร้างใหม่ พอมีของเก่า
  // อยู่ก่อนหน้าฟีเจอร์นี้ หรืออยากเปลี่ยนทีหลัง ต้องแก้ตรงนี้ได้ด้วย) ----
  editingStationCategoryId = signal<number | null>(null);
  editStationValue = '';
  editStationCustomValue = '';

  // ---- popup เพิ่มเมนู ----
  addItemModalOpen = signal(false);
  newItemName = '';
  newItemPrice: number | null = null;
  newItemCategoryId: number | null = null;
  // ตัวเลือกเมนู (ถ้ามี) ที่ตั้งไว้พร้อมกันตอนสร้างเมนูใหม่เลย ไม่ต้องเปิด popup ตัวเลือกแยกทีหลัง
  newItemOptionGroups: DraftOptionGroup[] = [];

  // ---- popup แก้ไขเมนู ----
  editItemModalItem = signal<MenuItem | null>(null);
  editItemName = '';
  editItemPrice: number | null = null;
  editItemCategoryId: number | null = null;

  // ---- ค่าเริ่มต้นตัวเลือกระดับหมวดหมู่ (ตั้งครั้งเดียว ใช้ซ้ำได้หลายเมนู) ----
  templateManagerCategoryId = signal<number | null>(null);
  categoryTemplates = signal<CategoryOptionTemplate[]>([]);
  templateStatus = signal<SaveStatus | null>(null);

  newTemplateName = '';
  newTemplateRequired = true;
  draftTemplateChoices: DraftChoice[] = [{ name: '', price_delta: 0 }];

  // ---- popup แก้ไขตัวเลือกของเมนูแต่ละอย่าง ----
  optionModalItem = signal<MenuItem | null>(null);
  optionModalTemplates = signal<CategoryOptionTemplate[]>([]);
  optionSaveStatus = signal<SaveStatus | null>(null);

  newGroupName = '';
  newGroupRequired = true;
  draftChoices: DraftChoice[] = [{ name: '', price_delta: 0 }];

  private choiceDrafts: Record<number, ChoiceDraft> = {};

  constructor(private menuService: MenuService) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.menuService.getCategories().subscribe({
      next: (cats) => {
        this.categories.set(cats);
        if (!this.newItemCategoryId && cats.length > 0) {
          this.newItemCategoryId = cats[0].id;
        }
      },
      error: (err) => this.message.set(err?.error?.error ?? 'โหลดหมวดหมู่ไม่สำเร็จ')
    });

    this.menuService.getMenuItems().subscribe({
      next: (items) => {
        this.menuItems.set(items);
        // ถ้า popup ตัวเลือกเปิดอยู่ ให้อัปเดตข้อมูลเมนูตัวนั้นให้เป็นชุดล่าสุดด้วย
        const openItem = this.optionModalItem();
        if (openItem) {
          this.optionModalItem.set(items.find((i) => i.id === openItem.id) ?? null);
        }
      },
      error: (err) => this.message.set(err?.error?.error ?? 'โหลดเมนูไม่สำเร็จ')
    });
  }

  categoryName(id: number): string {
    return this.categories().find((c) => c.id === id)?.name ?? '-';
  }

  // มีเมนูอยู่ในหมวดนี้หรือไม่ — ใช้กันไม่ให้ลบหมวดหมู่ทิ้งทั้งที่ยังมีเมนูผูกอยู่
  categoryHasItems(categoryId: number): boolean {
    return this.menuItems().some((item) => item.category_id === categoryId);
  }

  // ---- popup ยืนยัน ใช้ร่วมกันหลายจุด ----

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

  // ---- popup เพิ่มหมวดหมู่ ----

  openAddCategoryModal(): void {
    this.newCategoryName = '';
    this.newCategoryStation = this.stationOptions()[0] ?? DEFAULT_STATIONS[0];
    this.newCategoryStationCustom = '';
    this.message.set(null);
    this.addCategoryModalOpen.set(true);
  }

  closeAddCategoryModal(): void {
    this.addCategoryModalOpen.set(false);
  }

  addCategory(): void {
    if (!this.newCategoryName.trim()) {
      this.message.set('กรอกชื่อหมวดหมู่');
      return;
    }
    const station =
      this.newCategoryStation === CUSTOM_STATION_VALUE
        ? this.newCategoryStationCustom.trim()
        : this.newCategoryStation;

    this.menuService
      .createCategory({
        name: this.newCategoryName,
        sort_order: this.categories().length + 1,
        station
      })
      .subscribe({
        next: () => {
          this.message.set(null);
          this.closeAddCategoryModal();
          this.reload();
        },
        error: (err) => this.message.set(err?.error?.error ?? 'เพิ่มหมวดหมู่ไม่สำเร็จ')
      });
  }

  // ---- แก้ไขสถานที่ทำของหมวดหมู่ที่มีอยู่แล้ว ----

  openStationEditor(cat: Category): void {
    this.editingStationCategoryId.set(cat.id);
    this.editStationValue = cat.station || this.stationOptions()[0] || DEFAULT_STATIONS[0];
    this.editStationCustomValue = '';
    this.message.set(null);
  }

  closeStationEditor(): void {
    this.editingStationCategoryId.set(null);
  }

  saveStationEdit(cat: Category): void {
    const station =
      this.editStationValue === CUSTOM_STATION_VALUE
        ? this.editStationCustomValue.trim()
        : this.editStationValue;

    if (!station) {
      this.message.set('กรอกชื่อสถานที่');
      return;
    }

    this.menuService
      .updateCategory(cat.id, { name: cat.name, sort_order: cat.sort_order, station })
      .subscribe({
        next: () => {
          this.message.set(null);
          this.closeStationEditor();
          this.reload();
        },
        error: (err) => this.message.set(err?.error?.error ?? 'แก้ไขสถานที่ไม่สำเร็จ')
      });
  }

  deleteCategory(id: number): void {
    if (this.categoryHasItems(id)) {
      this.message.set('ลบหมวดหมู่นี้ไม่ได้ เพราะยังมีเมนูอยู่ในหมวดนี้ กรุณาย้ายหรือลบเมนูออกก่อน');
      return;
    }
    const cat = this.categories().find((c) => c.id === id);
    this.askConfirm(`ยืนยันลบหมวดหมู่ "${cat?.name ?? ''}"? การลบไม่สามารถย้อนกลับได้`, () => {
      this.menuService.deleteCategory(id).subscribe({
        next: () => this.reload(),
        error: (err) => this.message.set(err?.error?.error ?? 'ลบหมวดหมู่ไม่สำเร็จ')
      });
    });
  }

  // ---- popup เพิ่มเมนู ----

  openAddItemModal(): void {
    this.newItemName = '';
    this.newItemPrice = null;
    if (!this.newItemCategoryId && this.categories().length > 0) {
      this.newItemCategoryId = this.categories()[0].id;
    }
    this.newItemOptionGroups = [];
    this.message.set(null);
    this.addItemModalOpen.set(true);
  }

  closeAddItemModal(): void {
    this.addItemModalOpen.set(false);
  }

  // ---- ตัวเลือกเมนูที่ร่างไว้ใน popup เพิ่มเมนู ----

  addDraftOptionGroup(): void {
    this.newItemOptionGroups.push({
      name: '',
      is_required: true,
      choices: [{ name: '', price_delta: 0 }]
    });
  }

  removeDraftOptionGroup(index: number): void {
    this.newItemOptionGroups.splice(index, 1);
  }

  addDraftOptionGroupChoice(groupIndex: number): void {
    this.newItemOptionGroups[groupIndex].choices.push({ name: '', price_delta: 0 });
  }

  removeDraftOptionGroupChoice(groupIndex: number, choiceIndex: number): void {
    const group = this.newItemOptionGroups[groupIndex];
    if (group.choices.length <= 1) return;
    group.choices.splice(choiceIndex, 1);
  }

  addItem(): void {
    if (!this.newItemName.trim() || !this.newItemCategoryId || !this.newItemPrice || this.newItemPrice <= 0) {
      this.message.set('กรอกชื่อเมนู ราคา และหมวดหมู่ให้ครบ');
      return;
    }
    this.menuService
      .createMenuItem({
        name: this.newItemName,
        price: this.newItemPrice,
        category_id: this.newItemCategoryId,
        is_available: true
      })
      .subscribe({
        next: (created) => {
          this.createDraftOptionGroups(created.id, this.newItemOptionGroups, () => {
            this.newItemName = '';
            this.newItemPrice = null;
            this.newItemOptionGroups = [];
            this.message.set(null);
            this.closeAddItemModal();
            this.reload();
          });
        },
        error: (err) => this.message.set(err?.error?.error ?? 'เพิ่มเมนูไม่สำเร็จ')
      });
  }

  // สร้างกลุ่มตัวเลือกที่ร่างไว้ทั้งหมดให้เมนูที่เพิ่งบันทึกสำเร็จ (ข้ามกลุ่ม/ตัวเลือกย่อยที่ไม่ได้กรอกชื่อ)
  // ทำหลังจากมี menuItemId จริงแล้วเท่านั้น เพราะ endpoint สร้างกลุ่มตัวเลือกต้องผูกกับเมนูที่มีอยู่แล้ว
  private createDraftOptionGroups(menuItemId: number, groups: DraftOptionGroup[], onDone: () => void): void {
    const validGroups = groups
      .map((g) => ({
        name: g.name.trim(),
        is_required: g.is_required,
        choices: g.choices
          .filter((c) => c.name.trim().length > 0)
          .map((c) => ({ name: c.name.trim(), price_delta: c.price_delta ?? 0 }))
      }))
      .filter((g) => g.name.length > 0 && g.choices.length > 0);

    if (validGroups.length === 0) {
      onDone();
      return;
    }

    let remaining = validGroups.length;
    let hadError = false;
    for (const group of validGroups) {
      this.menuService.createOptionGroup(menuItemId, group).subscribe({
        next: () => {
          remaining--;
          if (remaining === 0) onDone();
        },
        error: () => {
          if (!hadError) {
            hadError = true;
            this.message.set('เพิ่มเมนูสำเร็จ แต่เพิ่มตัวเลือกบางกลุ่มไม่สำเร็จ ลองแก้ไขเมนูนี้ทีหลังได้');
          }
          remaining--;
          if (remaining === 0) onDone();
        }
      });
    }
  }

  toggleAvailable(item: MenuItem): void {
    this.menuService.updateMenuItem(item.id, { ...item, is_available: !item.is_available }).subscribe({
      next: () => this.reload(),
      error: (err) => this.message.set(err?.error?.error ?? 'แก้ไขสถานะเมนูไม่สำเร็จ')
    });
  }

  // ---- popup แก้ไขเมนู ----

  openEditItemModal(item: MenuItem): void {
    this.editItemModalItem.set(item);
    this.editItemName = item.name;
    this.editItemPrice = item.price;
    this.editItemCategoryId = item.category_id;
    this.message.set(null);
  }

  closeEditItemModal(): void {
    this.editItemModalItem.set(null);
  }

  confirmSaveEditItem(): void {
    const item = this.editItemModalItem();
    if (!item) return;
    if (
      !this.editItemName.trim() ||
      !this.editItemCategoryId ||
      !this.editItemPrice ||
      this.editItemPrice <= 0
    ) {
      this.message.set('กรอกชื่อเมนู ราคา และหมวดหมู่ให้ครบ');
      return;
    }

    this.askConfirm(`ยืนยันบันทึกการแก้ไขเมนู "${item.name}"?`, () => {
      this.menuService
        .updateMenuItem(item.id, {
          name: this.editItemName,
          price: this.editItemPrice!,
          category_id: this.editItemCategoryId!,
          is_available: item.is_available
        })
        .subscribe({
          next: () => {
            this.message.set(null);
            this.closeEditItemModal();
            this.reload();
          },
          error: (err) => this.message.set(err?.error?.error ?? 'แก้ไขเมนูไม่สำเร็จ')
        });
    });
  }

  confirmDeleteItem(item: MenuItem): void {
    this.askConfirm(`ยืนยันลบเมนู "${item.name}"? การลบไม่สามารถย้อนกลับได้`, () => {
      this.menuService.deleteMenuItem(item.id).subscribe({
        next: () => this.reload(),
        error: (err) => this.message.set(err?.error?.error ?? 'ลบเมนูไม่สำเร็จ')
      });
    });
  }

  // ---- ค่าเริ่มต้นตัวเลือกระดับหมวดหมู่ ----

  toggleTemplateManager(category: Category): void {
    if (this.templateManagerCategoryId() === category.id) {
      this.templateManagerCategoryId.set(null);
      return;
    }
    this.templateManagerCategoryId.set(category.id);
    this.templateStatus.set(null);
    this.resetTemplateDraft();
    this.loadCategoryTemplates(category.id);
  }

  loadCategoryTemplates(categoryId: number): void {
    this.menuService.getCategoryOptionTemplates(categoryId).subscribe({
      next: (templates) => this.categoryTemplates.set(templates),
      error: (err) =>
        this.templateStatus.set({
          type: 'error',
          text: err?.error?.error ?? 'โหลดค่าเริ่มต้นไม่สำเร็จ'
        })
    });
  }

  resetTemplateDraft(): void {
    this.newTemplateName = '';
    this.newTemplateRequired = true;
    this.draftTemplateChoices = [{ name: '', price_delta: 0 }];
  }

  addDraftTemplateChoiceRow(): void {
    this.draftTemplateChoices.push({ name: '', price_delta: 0 });
  }

  removeDraftTemplateChoiceRow(index: number): void {
    if (this.draftTemplateChoices.length <= 1) return;
    this.draftTemplateChoices.splice(index, 1);
  }

  saveTemplate(categoryId: number): void {
    const name = this.newTemplateName.trim();
    const choices = this.draftTemplateChoices
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({ name: c.name.trim(), price_delta: c.price_delta ?? 0 }));

    if (!name || choices.length === 0) {
      this.templateStatus.set({
        type: 'error',
        text: 'กรอกชื่อค่าเริ่มต้น และตัวเลือกย่อยอย่างน้อย 1 รายการ'
      });
      return;
    }

    this.menuService
      .createCategoryOptionTemplate(categoryId, {
        name,
        is_required: this.newTemplateRequired,
        choices
      })
      .subscribe({
        next: () => {
          this.templateStatus.set({ type: 'success', text: `บันทึก "${name}" แล้ว` });
          this.resetTemplateDraft();
          this.loadCategoryTemplates(categoryId);
        },
        error: (err) =>
          this.templateStatus.set({
            type: 'error',
            text: err?.error?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'
          })
      });
  }

  deleteTemplate(categoryId: number, templateId: number): void {
    this.menuService.deleteCategoryOptionTemplate(templateId).subscribe({
      next: () => {
        this.templateStatus.set({ type: 'success', text: 'ลบแล้ว' });
        this.loadCategoryTemplates(categoryId);
      },
      error: (err) =>
        this.templateStatus.set({ type: 'error', text: err?.error?.error ?? 'ลบไม่สำเร็จ' })
    });
  }

  // ---- popup แก้ไขตัวเลือกของเมนู ----

  openOptionModal(item: MenuItem): void {
    this.optionModalItem.set(item);
    this.optionSaveStatus.set(null);
    this.resetGroupDraft();
    this.menuService.getCategoryOptionTemplates(item.category_id).subscribe({
      next: (templates) => this.optionModalTemplates.set(templates),
      error: () => this.optionModalTemplates.set([])
    });
  }

  closeOptionModal(): void {
    this.optionModalItem.set(null);
    this.optionModalTemplates.set([]);
  }

  resetGroupDraft(): void {
    this.newGroupName = '';
    this.newGroupRequired = true;
    this.draftChoices = [{ name: '', price_delta: 0 }];
  }

  addDraftChoiceRow(): void {
    this.draftChoices.push({ name: '', price_delta: 0 });
  }

  removeDraftChoiceRow(index: number): void {
    if (this.draftChoices.length <= 1) return;
    this.draftChoices.splice(index, 1);
  }

  applyTemplate(item: MenuItem, template: CategoryOptionTemplate): void {
    this.menuService.applyOptionTemplateToMenuItem(item.id, template.id).subscribe({
      next: () => {
        this.optionSaveStatus.set({ type: 'success', text: `ใช้ค่าเริ่มต้น "${template.name}" แล้ว` });
        this.reload();
      },
      error: (err) =>
        this.optionSaveStatus.set({
          type: 'error',
          text: err?.error?.error ?? 'ใช้ค่าเริ่มต้นไม่สำเร็จ ลองใหม่อีกครั้ง'
        })
    });
  }

  // เปลี่ยน "บังคับให้เลือก" ของกลุ่มตัวเลือกที่มีอยู่แล้ว (ไม่ใช่แค่ตอนสร้างใหม่)
  toggleGroupRequired(group: MenuOptionGroup): void {
    const newValue = !group.is_required;
    this.menuService.updateOptionGroup(group.id, { is_required: newValue }).subscribe({
      next: () => {
        this.optionSaveStatus.set({
          type: 'success',
          text: `ตั้งค่า "${group.name}" เป็น${newValue ? 'บังคับให้เลือก' : 'ไม่บังคับ'}แล้ว`
        });
        this.reload();
      },
      error: (err) =>
        this.optionSaveStatus.set({
          type: 'error',
          text: err?.error?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'
        })
    });
  }

  saveOptionGroup(item: MenuItem): void {
    const name = this.newGroupName.trim();
    const choices = this.draftChoices
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({ name: c.name.trim(), price_delta: c.price_delta ?? 0 }));

    if (!name || choices.length === 0) {
      this.optionSaveStatus.set({
        type: 'error',
        text: 'กรอกชื่อกลุ่มตัวเลือก และตัวเลือกย่อยอย่างน้อย 1 รายการ'
      });
      return;
    }

    this.menuService
      .createOptionGroup(item.id, { name, is_required: this.newGroupRequired, choices })
      .subscribe({
        next: () => {
          this.optionSaveStatus.set({ type: 'success', text: `บันทึก "${name}" แล้ว` });
          this.resetGroupDraft();
          this.reload();
        },
        error: (err) =>
          this.optionSaveStatus.set({
            type: 'error',
            text: err?.error?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'
          })
      });
  }

  deleteGroup(groupId: number): void {
    this.menuService.deleteOptionGroup(groupId).subscribe({
      next: () => {
        this.optionSaveStatus.set({ type: 'success', text: 'ลบกลุ่มตัวเลือกแล้ว' });
        this.reload();
      },
      error: (err) =>
        this.optionSaveStatus.set({ type: 'error', text: err?.error?.error ?? 'ลบไม่สำเร็จ' })
    });
  }

  choiceDraft(groupId: number): ChoiceDraft {
    if (!this.choiceDrafts[groupId]) {
      this.choiceDrafts[groupId] = { name: '', price_delta: 0 };
    }
    return this.choiceDrafts[groupId];
  }

  addChoiceToGroup(group: MenuOptionGroup): void {
    const draft = this.choiceDraft(group.id);
    const name = draft.name.trim();
    if (!name) return;

    this.menuService.addOptionChoice(group.id, { name, price_delta: draft.price_delta ?? 0 }).subscribe({
      next: () => {
        delete this.choiceDrafts[group.id];
        this.optionSaveStatus.set({ type: 'success', text: `เพิ่ม "${name}" แล้ว` });
        this.reload();
      },
      error: (err) =>
        this.optionSaveStatus.set({ type: 'error', text: err?.error?.error ?? 'เพิ่มไม่สำเร็จ' })
    });
  }

  deleteChoice(choiceId: number): void {
    this.menuService.deleteOptionChoice(choiceId).subscribe({
      next: () => {
        this.optionSaveStatus.set({ type: 'success', text: 'ลบตัวเลือกย่อยแล้ว' });
        this.reload();
      },
      error: (err) =>
        this.optionSaveStatus.set({ type: 'error', text: err?.error?.error ?? 'ลบไม่สำเร็จ' })
    });
  }
}
