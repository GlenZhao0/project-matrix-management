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

const slotItemGridTemplate = '110px 120px 50px 50px';

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
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <Button onClick={() => navigate('/')}>返回</Button>
      </div>
      <h1 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 700 }}>模板管理</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
        <div
          style={{
            border: '1px solid #d9d9d9',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            padding: '16px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>模板列表</div>
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
                      marginBottom: '8px',
                      border: active ? '1px solid #1677ff' : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: active ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSelectTemplate(template.id)}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{template.template_name}</div>
                      <div style={{ marginTop: '4px', color: '#6b7280', fontSize: '13px' }}>
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
            border: '1px solid #d9d9d9',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            padding: '20px',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
            width: '390px',
            maxWidth: '100%',
            justifySelf: 'center',
          }}
        >
          {detailLoading ? (
            <Spin tip="模板详情加载中..." />
          ) : (
            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>模板名</div>
                <Input
                  value={editorState.template_name}
                  onChange={(e) => handleFieldChange('template_name', e.target.value)}
                  placeholder="输入模板名"
                  style={{ width: '380px', maxWidth: '100%' }}
                />
              </div>
              <div>
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>描述</div>
                <Input.TextArea
                  value={editorState.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder="输入模板描述"
                  rows={3}
                  style={{ width: '380px', maxWidth: '100%' }}
                />
              </div>
              <div>
                <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#374151' }}>推荐 Part Type</div>
                <Input
                  value={editorState.recommended_part_type}
                  onChange={(e) => handleFieldChange('recommended_part_type', e.target.value)}
                  placeholder="可选，普通字符串"
                  style={{ width: '380px', maxWidth: '100%' }}
                />
              </div>
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>槽位项</div>
                  <Button onClick={handleAddItem}>新增槽位项</Button>
                </div>
                {editorState.items.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '14px' }}>暂无槽位项</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ width: 'fit-content', display: 'grid', gap: '12px' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: slotItemGridTemplate,
                          gap: '12px',
                          alignItems: 'center',
                          padding: '0 12px',
                          color: '#6b7280',
                          fontSize: '13px',
                          fontWeight: 600,
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
                            gap: '12px',
                            alignItems: 'center',
                            padding: '12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            backgroundColor: '#f8fafc',
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
                          <Button onClick={() => handleRemoveItem(index)}>删除</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" onClick={handleSave} loading={saving}>
                  {selectedTemplateId ? '保存模板' : '创建模板'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplatePage;
