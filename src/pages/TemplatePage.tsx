import React, { useEffect, useState } from 'react';
import { Empty, Input, List, Select, Spin, message } from 'antd';
import { useNavigate } from 'react-router-dom';

import Button from '../components/common/Button';
import {
  createSlotTemplate,
  getSlotTemplateDetail,
  getSlotTemplateList,
  SlotTemplateDetail,
  SlotTemplateItemInput,
  SlotTemplateSummary,
  SlotTemplateUpsertInput,
  updateSlotTemplate,
} from '../api/slotTemplates';

interface TemplateEditorState {
  template_name: string;
  description: string;
  recommended_part_type: string;
  items: TemplateEditorItem[];
}

interface TemplateEditorItem extends SlotTemplateItemInput {
  ui_id: string;
}

const createEmptyEditorState = (): TemplateEditorState => ({
  template_name: '',
  description: '',
  recommended_part_type: '',
  items: [],
});

const slotItemGridTemplate = '104px 136px 52px 56px';

const createEditorItem = (item: SlotTemplateItemInput, uiId?: string): TemplateEditorItem => ({
  ...item,
  ui_id: uiId || `slot-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

const mapDetailToEditorState = (detail: SlotTemplateDetail): TemplateEditorState => ({
  template_name: detail.template_name,
  description: detail.description || '',
  recommended_part_type: detail.recommended_part_type || '',
  items: detail.items.map((item) => ({
    ui_id: item.id,
    group_type: item.group_type,
    slot_name: item.slot_name,
    sort_order: item.sort_order,
  })),
});

const TemplatePage: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SlotTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<TemplateEditorState>(createEmptyEditorState);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSelectTemplate = async (templateId: string) => {
    try {
      setDetailLoading(true);
      const detail = await getSlotTemplateDetail(templateId);
      setSelectedTemplateId(templateId);
      setEditorState(mapDetailToEditorState(detail));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取模板详情失败';
      message.error(errorMsg);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setListLoading(true);
        setLoadError(null);
        const data = await getSlotTemplateList();
        setTemplates(data);
        if (data.length > 0) {
          await handleSelectTemplate(data[0].id);
        } else {
          setSelectedTemplateId(null);
          setEditorState(createEmptyEditorState());
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取模板失败';
        setLoadError(errorMsg);
      } finally {
        setListLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  const handleCreateNew = () => {
    setSelectedTemplateId(null);
    setEditorState(createEmptyEditorState());
    setLoadError(null);
  };

  const handleFieldChange = (field: keyof Omit<TemplateEditorState, 'items'>, value: string) => {
    setEditorState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleItemChange = (index: number, field: keyof SlotTemplateItemInput, value: string | number) => {
    setEditorState((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: field === 'sort_order' ? Number(value) : value,
            }
          : item
      ),
    }));
  };

  const handleAddItem = () => {
    setEditorState((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        createEditorItem({
          group_type: 'external',
          slot_name: '',
          sort_order: prev.items.length + 1,
        }),
      ],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setEditorState((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const refreshTemplateList = async (nextSelectedId?: string) => {
    const data = await getSlotTemplateList();
    setTemplates(data);
    if (nextSelectedId) {
      setSelectedTemplateId(nextSelectedId);
    }
  };

  const handleSave = async () => {
    const payload: SlotTemplateUpsertInput = {
      template_name: editorState.template_name.trim(),
      description: editorState.description.trim() || undefined,
      recommended_part_type: editorState.recommended_part_type.trim() || undefined,
      items: editorState.items.map((item) => ({
        group_type: item.group_type,
        slot_name: item.slot_name.trim(),
        sort_order: Number(item.sort_order),
      })),
    };

    if (!payload.template_name) {
      message.error('模板名不能为空');
      return;
    }

    if (payload.items.some((item) => !item.slot_name || Number.isNaN(item.sort_order))) {
      message.error('请完整填写每个槽位项的名称和排序');
      return;
    }

    try {
      setSaving(true);
      const savedTemplate = selectedTemplateId
        ? await updateSlotTemplate(selectedTemplateId, payload)
        : await createSlotTemplate(payload);
      await refreshTemplateList(savedTemplate.id);
      setSelectedTemplateId(savedTemplate.id);
      setEditorState(mapDetailToEditorState(savedTemplate));
      message.success(selectedTemplateId ? '模板保存成功' : '模板创建成功');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '保存模板失败';
      message.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '24px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1180px', width: '100%', margin: '0 auto', display: 'grid', gap: '16px' }}>
      <div
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-card)',
          boxShadow: 'var(--shadow-md)',
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>模板清单</div>
          <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            在这里维护模板基础信息、推荐 Part Type 与默认槽位项。
          </div>
        </div>
        <Button onClick={() => navigate('/')}>返回</Button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px minmax(0, 740px)',
          gap: '24px',
          alignItems: 'start',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-card)',
            padding: '10px',
            boxShadow: 'var(--shadow-md)',
            position: 'sticky',
            top: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>Template List</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>模板导航</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px' }}>
            <Button type="primary" onClick={handleCreateNew}>新建模板</Button>
          </div>
          {listLoading ? (
            <Spin tip="模板加载中..." />
          ) : loadError ? (
            <Empty description={`加载失败: ${loadError}`} />
          ) : templates.length === 0 ? (
            <Empty description="暂无模板" />
          ) : (
            <List
              dataSource={templates}
              renderItem={(template) => {
                const active = template.id === selectedTemplateId;
                return (
                  <List.Item
                    key={template.id}
                    style={{
                      padding: '12px',
                      marginBottom: '6px',
                      border: active ? '1px solid var(--primary-border)' : '1px solid var(--border-strong)',
                      borderRadius: '8px',
                      backgroundColor: active ? 'var(--primary-soft)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      boxShadow: active ? '0 5px 12px color-mix(in srgb, var(--primary-color) 18%, transparent)' : 'none',
                    }}
                    onClick={() => handleSelectTemplate(template.id)}
                  >
                    <div style={{ width: '100%' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{template.template_name}</div>
                      <div style={{ marginTop: '3px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.35 }}>
                        {template.description || '无描述'}
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-card)',
            padding: '12px 16px',
            boxShadow: 'var(--shadow-md)',
            minWidth: 0,
            width: '100%',
            maxWidth: '740px',
            justifySelf: 'stretch',
          }}
        >
          {detailLoading ? (
            <Spin tip="模板详情加载中..." />
          ) : (
            <div style={{ maxWidth: '780px', margin: '0 auto', width: '100%' }}>
              <div style={{ display: 'grid', gap: '12px', minWidth: 0 }}>
                <div style={{ paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedTemplateId ? 'Template Detail' : '新建模板'}
                  </div>
                  <div style={{ marginTop: '3px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    右侧工作区用于编辑模板基础信息与默认槽位项。
                  </div>
                </div>
              <div style={{ padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: '10px', backgroundColor: 'var(--bg-card-soft)', width: '100%', minWidth: 0 }}>
                <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>模板名</div>
                <Input
                  value={editorState.template_name}
                  onChange={(e) => handleFieldChange('template_name', e.target.value)}
                  placeholder="输入模板名"
                  style={{ width: '100%', maxWidth: '100%' }}
                />
              </div>
              <div style={{ padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: '10px', backgroundColor: 'var(--bg-card-soft)', width: '100%', minWidth: 0 }}>
                <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>描述</div>
                <Input.TextArea
                  value={editorState.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder="输入模板描述"
                  rows={3}
                  style={{ width: '100%', maxWidth: '100%', display: 'block' }}
                />
              </div>
              <div style={{ padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: '10px', backgroundColor: 'var(--bg-card-soft)', width: '100%', minWidth: 0 }}>
                <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>推荐 Part Type</div>
                <Input
                  value={editorState.recommended_part_type}
                  onChange={(e) => handleFieldChange('recommended_part_type', e.target.value)}
                  placeholder="可选，普通字符串"
                  style={{ width: '100%', maxWidth: '100%' }}
                />
              </div>
              <div style={{ padding: '10px 12px', border: '1px solid var(--border-strong)', borderRadius: '10px', backgroundColor: 'var(--bg-card-muted)', minWidth: 0 }}>
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>槽位项</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>维护模板中的默认槽位清单</div>
                  </div>
                  <Button onClick={handleAddItem}>新增槽位项</Button>
                </div>
                {editorState.items.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>暂无槽位项</div>
                ) : (
                  <div style={{ overflowX: 'auto', minWidth: 0 }}>
                    <div
                      style={{
                        width: 'fit-content',
                        display: 'grid',
                        gap: '6px',
                        minWidth: 0,
                        padding: '8px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-card)',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: slotItemGridTemplate,
                          gap: '8px',
                          alignItems: 'center',
                          padding: '0 8px 2px',
                          color: 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        <div>分组</div>
                        <div>槽位名称</div>
                        <div>排序</div>
                        <div>操作</div>
                      </div>
      {editorState.items.map((item, index) => (
                        <div
                          key={item.ui_id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: slotItemGridTemplate,
                            gap: '8px',
                            alignItems: 'center',
                            padding: '6px 8px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            backgroundColor: 'var(--bg-card)',
                          }}
                        >
                          <Select
                            value={item.group_type}
                            onChange={(value) => handleItemChange(index, 'group_type', value)}
                            options={[
                              { label: 'external', value: 'external' },
                              { label: 'internal', value: 'internal' },
                            ]}
                          />
                          <Input
                            value={item.slot_name}
                            onChange={(e) => handleItemChange(index, 'slot_name', e.target.value)}
                            placeholder="输入槽位名称"
                          />
                          <Input
                            type="number"
                            value={String(item.sort_order)}
                            onChange={(e) => handleItemChange(index, 'sort_order', Number(e.target.value))}
                            placeholder="排序"
                          />
                          <Button
                            size="small"
                            onClick={() => handleRemoveItem(index)}
                            style={{ width: '100%', justifySelf: 'stretch' }}
                          >
                            删除
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingTop: '10px',
                  marginTop: '2px',
                  borderTop: '1px solid var(--border-color)',
                  minHeight: '42px',
                  background: 'linear-gradient(180deg, transparent 0%, var(--bg-card-soft) 100%)',
                }}
              >
                <Button type="primary" onClick={handleSave} loading={saving}>
                  {selectedTemplateId ? '保存模板' : '创建模板'}
                </Button>
              </div>
            </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default TemplatePage;
