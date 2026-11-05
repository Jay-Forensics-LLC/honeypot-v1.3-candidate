import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Check } from "lucide-react";
import { toast } from "sonner";

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸', rtl: false },
  { code: 'es', name: 'Español', flag: '🇪🇸', rtl: false },
  { code: 'fr', name: 'Français', flag: '🇫🇷', rtl: false },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', rtl: false },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'he', name: 'עברית', flag: '🇮🇱', rtl: true },
  { code: 'zh', name: '中文', flag: '🇨🇳', rtl: false },
  { code: 'ja', name: '日本語', flag: '🇯🇵', rtl: false },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', rtl: false },
  { code: 'pt', name: 'Português', flag: '🇵🇹', rtl: false }
];

// Translation dictionary (simplified - in production use i18next or similar)
const TRANSLATIONS = {
  en: {
    dashboard: 'Dashboard',
    cases: 'Cases',
    evidence: 'Evidence',
    alerts: 'Alerts',
    reports: 'Reports',
    tools: 'Tools',
    search: 'Search',
    settings: 'Settings',
    logout: 'Logout',
    welcome: 'Welcome',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    filter: 'Filter',
    export: 'Export',
    import: 'Import'
  },
  es: {
    dashboard: 'Panel',
    cases: 'Casos',
    evidence: 'Evidencia',
    alerts: 'Alertas',
    reports: 'Informes',
    tools: 'Herramientas',
    search: 'Buscar',
    settings: 'Configuración',
    logout: 'Cerrar sesión',
    welcome: 'Bienvenido',
    loading: 'Cargando...',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    create: 'Crear',
    filter: 'Filtrar',
    export: 'Exportar',
    import: 'Importar'
  },
  ar: {
    dashboard: 'لوحة التحكم',
    cases: 'القضايا',
    evidence: 'الأدلة',
    alerts: 'التنبيهات',
    reports: 'التقارير',
    tools: 'الأدوات',
    search: 'بحث',
    settings: 'الإعدادات',
    logout: 'تسجيل الخروج',
    welcome: 'مرحبا',
    loading: 'جار التحميل...',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    create: 'إنشاء',
    filter: 'تصفية',
    export: 'تصدير',
    import: 'استيراد'
  },
  he: {
    dashboard: 'לוח בקרה',
    cases: 'תיקים',
    evidence: 'ראיות',
    alerts: 'התראות',
    reports: 'דוחות',
    tools: 'כלים',
    search: 'חיפוש',
    settings: 'הגדרות',
    logout: 'התנתקות',
    welcome: 'ברוך הבא',
    loading: 'טוען...',
    save: 'שמור',
    cancel: 'ביטול',
    delete: 'מחק',
    edit: 'ערוך',
    create: 'צור',
    filter: 'סינון',
    export: 'ייצוא',
    import: 'ייבוא'
  },
  zh: {
    dashboard: '仪表板',
    cases: '案例',
    evidence: '证据',
    alerts: '警报',
    reports: '报告',
    tools: '工具',
    search: '搜索',
    settings: '设置',
    logout: '登出',
    welcome: '欢迎',
    loading: '加载中...',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    create: '创建',
    filter: '筛选',
    export: '导出',
    import: '导入'
  }
};

export default function LanguageSelector({ compact = false }) {
  const [currentLang, setCurrentLang] = useState(() => {
    return localStorage.getItem('app_language') || 'en';
  });

  useEffect(() => {
    const lang = LANGUAGES.find(l => l.code === currentLang);
    
    // Set HTML direction
    document.documentElement.dir = lang?.rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
    
    // Store in localStorage
    localStorage.setItem('app_language', currentLang);
  }, [currentLang]);

  const changeLanguage = (langCode) => {
    setCurrentLang(langCode);
    const lang = LANGUAGES.find(l => l.code === langCode);
    toast.success(`Language changed to ${lang.name}`);
    
    // Reload page to apply language changes
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Translation helper function
  const t = (key) => {
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en[key] || key;
  };

  // Export translation function to window for global access
  useEffect(() => {
    window.t = t;
  }, [currentLang]);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-slate-400" />
        <Select value={currentLang} onValueChange={changeLanguage}>
          <SelectTrigger className="w-32 bg-slate-800 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map(lang => (
              <SelectItem key={lang.code} value={lang.code}>
                <div className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {LANGUAGES.map(lang => (
        <Button
          key={lang.code}
          variant={currentLang === lang.code ? "default" : "outline"}
          onClick={() => changeLanguage(lang.code)}
          className={`justify-start ${
            currentLang === lang.code 
              ? 'bg-blue-600 hover:bg-blue-700' 
              : 'border-slate-700'
          }`}
        >
          <span className="text-2xl mr-2">{lang.flag}</span>
          <span className="flex-1 text-left">{lang.name}</span>
          {currentLang === lang.code && (
            <Check className="w-4 h-4" />
          )}
        </Button>
      ))}
    </div>
  );
}

// Export translation function
export function useTranslation() {
  const [currentLang] = useState(() => {
    return localStorage.getItem('app_language') || 'en';
  });

  const t = (key) => {
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.en[key] || key;
  };

  return { t, currentLang };
}