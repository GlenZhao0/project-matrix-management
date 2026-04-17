import React, { useEffect, useMemo, useState } from 'react';
import { Input, Modal, message } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { deleteProjectList, getProjects, renameProjectList } from '../api/projects';

const DEFAULT_PROJECT_LIST_NAME = '默认清单';
const PROJECT_LISTS_CHANGED_EVENT = 'project-lists-changed';

const sortProjectLists = (names: string[]) => {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)));
  const otherNames = uniqueNames
    .filter((name) => name !== DEFAULT_PROJECT_LIST_NAME)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return uniqueNames.includes(DEFAULT_PROJECT_LIST_NAME)
    ? [DEFAULT_PROJECT_LIST_NAME, ...otherNames]
    : otherNames;
};

const normalizeProjectListName = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized || normalized === '项目清单') {
    return DEFAULT_PROJECT_LIST_NAME;
  }
  return normalized;
};

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [persistedProjectLists, setPersistedProjectLists] = useState<string[]>([]);
  const [draftProjectLists, setDraftProjectLists] = useState<string[]>([]);
  const [newListModalOpen, setNewListModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingListName, setEditingListName] = useState<string | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const activeProjectList = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeProjectListName(params.get('projectListName'));
  }, [location.search]);

  const projectLists = useMemo(
    () => sortProjectLists([...persistedProjectLists, ...draftProjectLists]),
    [draftProjectLists, persistedProjectLists],
  );

  const fetchProjectLists = async (options?: { preferredActiveList?: string; removedListName?: string }) => {
    try {
      const projects = await getProjects();
      const names = projects.map((project) => normalizeProjectListName(project.project_list_name));
      const nextLists = sortProjectLists(names).filter(
        (name) => name !== options?.removedListName,
      );
      setPersistedProjectLists(nextLists);
      setDraftProjectLists((prev) => prev.filter((name) => !nextLists.includes(name)));
    } catch (err) {
      console.error('获取项目清单分类失败:', err);
    }
  };

  useEffect(() => {
    void fetchProjectLists();

    const handleProjectListsChanged = () => {
      void fetchProjectLists();
    };

    window.addEventListener(PROJECT_LISTS_CHANGED_EVENT, handleProjectListsChanged);
    return () => window.removeEventListener(PROJECT_LISTS_CHANGED_EVENT, handleProjectListsChanged);
  }, [activeProjectList]);

  const navigateToProjectList = (listName: string) => {
    navigate(`/?projectListName=${encodeURIComponent(listName)}`);
  };

  const isProjectListActive = (listName: string) =>
    location.pathname === '/' && activeProjectList === listName;

  const isRouteActive = (path: string) => location.pathname === path;

  const secondaryMenuItems = [
    { label: '模板', path: '/templates' },
    { label: '系统设置', path: '/settings' },
  ];

  const handleCreateList = () => {
    const normalizedName = newListName.trim();
    if (!normalizedName) {
      message.error('清单名称不能为空');
      return;
    }

    if (projectLists.includes(normalizedName) || normalizedName === DEFAULT_PROJECT_LIST_NAME) {
      message.warning('该项目清单名称已存在');
      return;
    }

    setDraftProjectLists((prev) =>
      [...prev, normalizedName].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    );
    setNewListModalOpen(false);
    setNewListName('');
    setEditingListName(null);
    setRenameValue('');
    navigateToProjectList(normalizedName);
  };

  const openRenameModal = (listName: string) => {
    setEditingListName(listName);
    setRenameValue(listName);
    setRenameModalOpen(true);
  };

  const handleRenameList = async () => {
    if (!editingListName) {
      return;
    }

    const nextName = renameValue.trim();
    if (!nextName) {
      message.error('清单名称不能为空');
      return;
    }

    if (nextName === editingListName) {
      setRenameModalOpen(false);
      setEditingListName(null);
      setRenameValue('');
      return;
    }

    if (projectLists.includes(nextName)) {
      message.warning('该项目清单名称已存在');
      return;
    }

    const isDraftOnly =
      draftProjectLists.includes(editingListName) && !persistedProjectLists.includes(editingListName);

    if (isDraftOnly) {
      setDraftProjectLists((prev) =>
        sortProjectLists(prev.map((name) => (name === editingListName ? nextName : name))),
      );
      setRenameModalOpen(false);
      setEditingListName(null);
      setRenameValue('');
      if (activeProjectList === editingListName) {
        navigateToProjectList(nextName);
      }
      message.success('项目清单已重命名');
      window.dispatchEvent(new Event(PROJECT_LISTS_CHANGED_EVENT));
      return;
    }

    try {
      const result = await renameProjectList(editingListName, nextName);
      message.success(result.message);
      setRenameModalOpen(false);
      setEditingListName(null);
      setRenameValue('');
      await fetchProjectLists();
      window.dispatchEvent(new Event(PROJECT_LISTS_CHANGED_EVENT));

      if (activeProjectList === editingListName) {
        navigateToProjectList(nextName);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '重命名项目清单失败';
      message.error(errorMsg);
    }
  };

  const handleDeleteList = async (listName: string) => {
    try {
      const projects = await getProjects(listName);
      if (projects.length > 0) {
        message.warning('该项目清单下仍有项目，无法删除');
        return;
      }

      const isDraftOnly = draftProjectLists.includes(listName) && !persistedProjectLists.includes(listName);
      const remainingLists = projectLists.filter((name) => name !== listName);
      const nextActiveList = remainingLists[0] || null;

      if (isDraftOnly) {
        setDraftProjectLists((prev) => prev.filter((name) => name !== listName));
        setPersistedProjectLists((prev) => prev.filter((name) => name !== listName));
        if (activeProjectList === listName) {
          if (nextActiveList) {
            navigateToProjectList(nextActiveList);
          } else {
            navigate('/');
          }
        }
        message.success('项目清单已删除');
        window.dispatchEvent(new Event(PROJECT_LISTS_CHANGED_EVENT));
        return;
      }

      const result = await deleteProjectList(listName);
      message.success(result.message);
      setDraftProjectLists((prev) => prev.filter((name) => name !== listName));
      setPersistedProjectLists((prev) => prev.filter((name) => name !== listName));
      await fetchProjectLists({ removedListName: listName });
      if (activeProjectList === listName) {
        if (nextActiveList) {
          navigateToProjectList(nextActiveList);
        } else {
          navigate('/');
        }
      }
      window.dispatchEvent(new Event(PROJECT_LISTS_CHANGED_EVENT));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '删除项目清单失败';
      if (errorMsg.includes('该项目清单下仍有项目，无法删除')) {
        message.warning('该项目清单下仍有项目，无法删除');
        return;
      }
      if (errorMsg.includes('项目清单不存在')) {
        setDraftProjectLists((prev) => prev.filter((name) => name !== listName));
        setPersistedProjectLists((prev) => prev.filter((name) => name !== listName));
        const remainingLists = projectLists.filter((name) => name !== listName);
        if (activeProjectList === listName) {
          if (remainingLists[0]) {
            navigateToProjectList(remainingLists[0]);
          } else {
            navigate('/');
          }
        }
        message.success('项目清单已删除');
        window.dispatchEvent(new Event(PROJECT_LISTS_CHANGED_EVENT));
        return;
      }
      message.error(errorMsg);
    }
  };

  return (
    <>
      <div
        style={{
          width: '220px',
          backgroundColor: 'var(--bg-sidebar)',
          borderRight: '1px solid var(--border-color)',
          minHeight: '100vh',
          padding: '20px 0',
          position: 'fixed',
          left: 0,
          top: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ paddingLeft: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            散热BU项目管理系统
          </h2>
        </div>

        <div>
          <div
            style={{
              padding: '12px 20px',
              fontSize: '15px',
              color: 'var(--text-primary)',
              backgroundColor: 'transparent',
              borderLeft: '3px solid transparent',
              fontWeight: 700,
              transition: 'all 0.2s ease',
            }}
          >
            项目清单
          </div>

          <div style={{ display: 'grid', gap: '2px', padding: '6px 12px 4px 0' }}>
            {projectLists.map((item) => {
              const active = isProjectListActive(item);
              const canManage = true;

              return (
                <div
                  key={item}
                  onClick={() => navigateToProjectList(item)}
                  style={{
                    marginLeft: '24px',
                    padding: '8px 12px 8px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: active ? 'var(--primary-color)' : 'var(--text-secondary)',
                    backgroundColor: active ? 'var(--bg-sidebar-subtle)' : 'transparent',
                    borderLeft: active ? '2px solid var(--primary-border)' : '2px solid transparent',
                    borderRadius: '0 8px 8px 0',
                    fontWeight: active ? 600 : 500,
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item}
                  </span>
                  {canManage ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openRenameModal(item);
                        }}
                        title="编辑清单"
                        aria-label="编辑清单"
                        style={{
                          width: '22px',
                          height: '22px',
                          border: 'none',
                          background: 'transparent',
                          color: active ? 'var(--primary-color)' : 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          borderRadius: '6px',
                        }}
                      >
                        <EditOutlined />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteList(item);
                        }}
                        title="删除清单"
                        aria-label="删除清单"
                        style={{
                          width: '22px',
                          height: '22px',
                          border: 'none',
                          background: 'transparent',
                          color: active ? 'var(--primary-color)' : 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          borderRadius: '6px',
                        }}
                      >
                        <DeleteOutlined />
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div
            onClick={() => setNewListModalOpen(true)}
            style={{
              marginLeft: '24px',
              padding: '8px 12px 8px 16px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--primary-color)',
              borderLeft: '2px solid transparent',
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
          >
            + 新建清单
          </div>
        </div>

        <div style={{ margin: '18px 20px', height: '1px', backgroundColor: 'var(--border-color)' }} />

        <div>
          {secondaryMenuItems.map((item) => (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                padding: '12px 20px',
                cursor: 'pointer',
                fontSize: '15px',
                color: isRouteActive(item.path) ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isRouteActive(item.path) ? 'var(--bg-sidebar-active)' : 'transparent',
                borderLeft: isRouteActive(item.path) ? '3px solid var(--primary-color)' : '3px solid transparent',
                fontWeight: isRouteActive(item.path) ? 700 : 600,
                transition: 'all 0.2s ease',
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <Modal
        title="新建清单"
        open={newListModalOpen}
        onCancel={() => {
          setNewListModalOpen(false);
          setNewListName('');
        }}
        onOk={handleCreateList}
        okText="确认"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>输入新的项目清单名称，创建后可用于筛选和新建项目。</div>
          <Input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            placeholder="例如：A产品线项目清单"
            onPressEnter={handleCreateList}
          />
        </div>
      </Modal>

      <Modal
        title="重命名清单"
        open={renameModalOpen}
        onCancel={() => {
          setRenameModalOpen(false);
          setEditingListName(null);
          setRenameValue('');
        }}
        onOk={() => void handleRenameList()}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>修改项目清单名称，保存后左侧导航会立即更新。</div>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="输入新的清单名称"
            onPressEnter={() => void handleRenameList()}
          />
        </div>
      </Modal>
    </>
  );
};

export default Sidebar;
