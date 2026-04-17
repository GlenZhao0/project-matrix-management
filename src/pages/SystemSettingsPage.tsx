import React, { useEffect, useRef, useState } from 'react';
import { Input, Select, Spin, message } from 'antd';

import Button from '../components/common/Button';
import {
  SystemPathSettings,
  SystemPathSettingsInput,
  getSystemSettings,
  selectDirectory,
  updateSystemSettings,
  validateSystemSettings,
} from '../api/system';
import { ThemeSetting, useTheme } from '../theme/ThemeProvider';

const emptySettings: SystemPathSettingsInput = {
  project_root: '',
  import_root: '',
  export_root: '',
  theme: 'system',
};

const themeOptions: Array<{ value: ThemeSetting; label: string; hint: string }> = [
  { value: 'light', label: '浅色模式', hint: '使用明亮的管理后台风格。' },
  { value: 'dark', label: '深色模式', hint: '使用深灰商务暗色风格。' },
  { value: 'system', label: '跟随系统', hint: '自动跟随操作系统明暗模式。' },
];

type PathSettingsField = 'project_root' | 'import_root' | 'export_root';

const pathFieldMeta: Array<{ key: PathSettingsField; label: string; hint: string }> = [
  {
    key: 'project_root',
    label: 'Project Root',
    hint: '项目目录的根路径，新建项目时会在这里创建项目文件夹。',
  },
  {
    key: 'import_root',
    label: 'Import Root',
    hint: '导入/待上传文件的默认目录，槽位导入与备份导入会优先从这里开始选择。',
  },
  {
    key: 'export_root',
    label: 'Export Root',
    hint: '项目备份导出的默认目录。',
  },
];

const validationTone = (settings: SystemPathSettings | null, key: PathSettingsField) => {
  const validation = settings?.validations[key];
  if (!validation) {
    return {
      borderColor: 'var(--border-strong)',
      backgroundColor: 'var(--bg-card-muted)',
      color: 'var(--text-secondary)',
    };
  }

  if (validation.exists && validation.is_directory && validation.writable) {
    return {
      borderColor: 'var(--success-border)',
      backgroundColor: 'var(--success-soft)',
      color: 'var(--success-text)',
    };
  }

  return {
    borderColor: 'var(--warning-border)',
    backgroundColor: 'var(--warning-soft)',
    color: 'var(--warning-text)',
  };
};

const SystemSettingsPage: React.FC = () => {
  const { themeSetting, setThemeSetting } = useTheme();
  const [settingsForm, setSettingsForm] = useState<SystemPathSettingsInput>(emptySettings);
  const [settingsResult, setSettingsResult] = useState<SystemPathSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const persistedSettingsRef = useRef<SystemPathSettings | null>(null);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await getSystemSettings();
      setSettingsForm({
        project_root: result.project_root,
        import_root: result.import_root,
        export_root: result.export_root,
        theme: result.theme,
      });
      setSettingsResult(result);
      persistedSettingsRef.current = result;
      setThemeSetting(result.theme);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取系统设置失败';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleFieldChange = (field: PathSettingsField, value: string) => {
    setSettingsForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleBrowseDirectory = async (field: PathSettingsField, label: string) => {
    try {
      const selectedPath = await selectDirectory(`选择 ${label}`, settingsForm[field] || undefined);
      handleFieldChange(field, selectedPath);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `选择 ${label} 失败`;
      message.error(errorMsg);
    }
  };

  const handleValidate = async () => {
    try {
      setValidating(true);
      const result = await validateSystemSettings(settingsForm);
      setSettingsResult(result);
      message.success('路径校验完成');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '路径校验失败';
      message.error(errorMsg);
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const result = await updateSystemSettings(settingsForm);
      setSettingsForm({
        project_root: result.project_root,
        import_root: result.import_root,
        export_root: result.export_root,
        theme: result.theme,
      });
      setSettingsResult(result);
      persistedSettingsRef.current = result;
      setThemeSetting(result.theme);
      message.success('系统设置保存成功');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '系统设置保存失败';
      message.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = async (value: ThemeSetting) => {
    const previousTheme = settingsForm.theme;
    setSettingsForm((prev) => ({ ...prev, theme: value }));
    setThemeSetting(value);

    const persisted = persistedSettingsRef.current;
    if (!persisted) {
      return;
    }

    try {
      setThemeSaving(true);
      const result = await updateSystemSettings({
        project_root: persisted.project_root,
        import_root: persisted.import_root,
        export_root: persisted.export_root,
        theme: value,
      });
      setSettingsResult(result);
      persistedSettingsRef.current = result;
      setSettingsForm((prev) => ({ ...prev, theme: result.theme }));
      message.success('外观设置已保存');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '保存外观设置失败';
      setThemeSetting(previousTheme);
      setSettingsForm((prev) => ({ ...prev, theme: previousTheme }));
      message.error(errorMsg);
    } finally {
      setThemeSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0' }}>
        <Spin size="large" tip="系统设置加载中..." />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '16px', maxWidth: '1040px' }}>
      <div
        style={{
          padding: '16px 18px',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-card)',
          boxShadow: 'var(--shadow-md)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>系统设置</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
          在这里集中维护系统路径。把项目拷贝到另一台电脑后，只需要修改这些目录即可继续运行。
        </div>
      </div>

      <div
        style={{
          padding: '16px 18px',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-card)',
          boxShadow: 'var(--shadow-md)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Appearance / 外观设置</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
            切换浅色、深色或跟随系统主题。选择后会立即生效，并自动保存。
          </div>
        </div>
        <div
          style={{
            padding: '12px 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-card-soft)',
            display: 'grid',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>主题模式</div>
          <Select
            value={themeSetting}
            onChange={(value) => void handleThemeChange(value)}
            loading={themeSaving}
            options={themeOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
            {themeOptions.find((option) => option.value === themeSetting)?.hint}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '16px 18px',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-card)',
          boxShadow: 'var(--shadow-md)',
          display: 'grid',
          gap: '14px',
        }}
      >
        {pathFieldMeta.map((field) => {
          const validation = settingsResult?.validations[field.key];
          const tone = validationTone(settingsResult, field.key);

          return (
            <div
              key={field.key}
              style={{
                padding: '12px 14px',
                border: '1px solid var(--border-strong)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card-soft)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <div style={{ display: 'grid', gap: '4px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{field.label}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>{field.hint}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '10px', alignItems: 'center' }}>
                <Input
                  value={settingsForm[field.key]}
                  onChange={(event) => handleFieldChange(field.key, event.target.value)}
                  placeholder={`输入 ${field.label} 路径`}
                />
                <Button onClick={() => handleBrowseDirectory(field.key, field.label)}>
                  选择目录
                </Button>
              </div>
              <div
                style={{
                  padding: '9px 10px',
                  border: `1px solid ${tone.borderColor}`,
                  borderRadius: '8px',
                  backgroundColor: tone.backgroundColor,
                  color: tone.color,
                  fontSize: '12px',
                  lineHeight: 1.6,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0 8px',
                  alignItems: 'center',
                  wordBreak: 'break-word',
                }}
              >
                {validation ? (
                  <>
                    <span>{validation.message}</span>
                    <span>｜</span>
                    <span>路径：{validation.path}</span>
                    <span>｜</span>
                    <span>exists={String(validation.exists)}</span>
                    <span>｜</span>
                    <span>writable={String(validation.writable)}</span>
                    <span>｜</span>
                    <span>can_create={String(validation.can_create)}</span>
                  </>
                ) : (
                  <span>尚未校验该路径</span>
                )}
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', paddingTop: '6px' }}>
          <Button onClick={handleValidate} loading={validating}>
            校验路径
          </Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存设置
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SystemSettingsPage;
