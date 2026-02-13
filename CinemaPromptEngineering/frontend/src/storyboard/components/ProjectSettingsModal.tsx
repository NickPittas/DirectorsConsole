/**
 * ProjectSettingsModal - Configure project folder and naming
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, CheckCircle, XCircle } from 'lucide-react';
import { ProjectSettings, projectManager, getDefaultOrchestratorUrl } from '../services/project-manager';
import { FileBrowserDialog } from './FileBrowser/FileBrowserDialog';
import './ProjectSettingsModal.css';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProjectSettings;
  onSave: (settings: Partial<ProjectSettings>) => void;
}

export function ProjectSettingsModal({ isOpen, onClose, settings, onSave }: ProjectSettingsModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(settings.name);
  const [path, setPath] = useState(settings.path);
  const [namingTemplate, setNamingTemplate] = useState(settings.namingTemplate);
  const [autoSave, setAutoSave] = useState(settings.autoSave);
  const [orchestratorUrl, setOrchestratorUrl] = useState(settings.orchestratorUrl || getDefaultOrchestratorUrl());
  const [orchestratorStatus, setOrchestratorStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [pathValidation, setPathValidation] = useState<{
    valid: boolean;
    exists: boolean;
    message: string;
  } | null>(null);
  const [validating, setValidating] = useState(false);
  
  // Sync with external settings when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(settings.name);
      setPath(settings.path);
      setNamingTemplate(settings.namingTemplate);
      setAutoSave(settings.autoSave);
      setOrchestratorUrl(settings.orchestratorUrl || getDefaultOrchestratorUrl());
    }
  }, [isOpen, settings]);
  
  // Check Orchestrator health when URL changes
  useEffect(() => {
    if (!isOpen || !orchestratorUrl) return;
    
    setOrchestratorStatus('checking');
    const controller = new AbortController();
    
    fetch(`${orchestratorUrl}/api/health`, { signal: controller.signal })
      .then(res => res.ok ? setOrchestratorStatus('online') : setOrchestratorStatus('offline'))
      .catch(() => setOrchestratorStatus('offline'));
    
    return () => controller.abort();
  }, [isOpen, orchestratorUrl]);
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    onSave({ name, path, namingTemplate, autoSave, orchestratorUrl });
    onClose();
  };

  const handleValidatePath = async () => {
    if (!path || !orchestratorUrl) return;
    setValidating(true);
    const result = await projectManager.validateProjectPath(path, orchestratorUrl);
    setPathValidation(result);
    setValidating(false);
  };

  // Preview the filename
  const previewFilename = () => {
    const now = new Date();
    const pad = (n: number, len: number = 2) => n.toString().padStart(len, '0');
    
    const tokens: Record<string, string> = {
      '{project}': name.replace(/[<>:"/\\|?*\s]/g, '_').substring(0, 50),
      '{panel}': 'Panel_01',  // Updated: Now shows full panel name with prefix
      '{version}': 'v001',
      '{timestamp}': `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      '{date}': `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      '{time}': `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      '{seed}': '12345678',
      '{workflow}': 'MyWorkflow',
    };
    
    let filename = namingTemplate;
    for (const [token, value] of Object.entries(tokens)) {
      filename = filename.split(token).join(value);
    }
    
    return filename + '.png';
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="project-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('storyboard.projectSettings.title')}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="project-name">{t('storyboard.projectSettings.projectName')}</label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('storyboard.projectSettings.projectNamePlaceholder')}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="project-path">{t('storyboard.projectSettings.outputPath')}</label>
            <div className="input-with-button">
              <input
                id="project-path"
                type="text"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setPathValidation(null);
                }}
                onBlur={handleValidatePath}
                placeholder={t('storyboard.projectSettings.outputPathPlaceholder')}
              />
              <button
                type="button"
                className="browse-btn"
                onClick={() => setShowFolderBrowser(true)}
                disabled={orchestratorStatus !== 'online'}
                title={orchestratorStatus !== 'online' ? t('storyboard.projectSettings.browseRequiresOnline') : t('storyboard.projectSettings.browseFolders')}
              >
                <FolderOpen size={16} />
              </button>
              <button
                type="button"
                className="validate-btn"
                onClick={handleValidatePath}
                disabled={!path || !orchestratorUrl || validating}
                title={t('storyboard.projectSettings.validatePathTitle')}
              >
                {validating ? '...' : t('storyboard.projectSettings.validate')}
              </button>
            </div>
            {pathValidation && (
              <div className={`path-validation-indicator ${pathValidation.valid ? 'valid' : 'invalid'}`}>
                {pathValidation.valid ? <CheckCircle size={14} /> : <XCircle size={14} />}
                <span>{pathValidation.message}</span>
              </div>
            )}
            <small className="help-text">
              {t('storyboard.projectSettings.outputPathHelp')}
            </small>
          </div>
          
          <div className="form-group">
            <label htmlFor="orchestrator-url">
              {t('storyboard.projectSettings.orchestratorUrl')}
              <span className={`status-indicator ${orchestratorStatus}`}>
                {orchestratorStatus === 'checking'
                  ? '...'
                  : orchestratorStatus === 'online'
                    ? ` ${t('storyboard.projectSettings.statusOnline')}`
                    : ` ${t('storyboard.projectSettings.statusOffline')}`}
              </span>
            </label>
            <input
              id="orchestrator-url"
              type="text"
              value={orchestratorUrl}
              onChange={(e) => setOrchestratorUrl(e.target.value)}
              placeholder={t('storyboard.projectSettings.orchestratorUrlPlaceholder')}
            />
            <small className="help-text">
              {t('storyboard.projectSettings.orchestratorUrlHelp')}
            </small>
          </div>
          
          <div className="form-group">
            <label htmlFor="naming-template">{t('storyboard.projectSettings.namingTemplate')}</label>
            <input
              id="naming-template"
              type="text"
              value={namingTemplate}
              onChange={(e) => setNamingTemplate(e.target.value)}
              placeholder={t('storyboard.projectSettings.namingTemplatePlaceholder')}
            />
            <small className="help-text">
              {t('storyboard.projectSettings.availableTokens')} {'{project}'}, {'{panel}'}, {'{version}'}, {'{timestamp}'}, {'{date}'}, {'{time}'}, {'{seed}'}, {'{workflow}'}
              <br />
              <span>{t('storyboard.projectSettings.panelTokenExplanation')}</span>
            </small>
            <div className="preview">
              <strong>{t('storyboard.projectSettings.preview')}</strong> {previewFilename()}
            </div>
          </div>
          
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              {t('storyboard.projectSettings.autoSave')}
            </label>
            <small className="help-text">
              {t('storyboard.projectSettings.autoSaveHelp')}
            </small>
          </div>
          
          <div className="template-examples">
            <h4>{t('storyboard.projectSettings.commonTemplates')}</h4>
            <div className="template-list">
              <button 
                type="button" 
                className="template-btn"
                onClick={() => setNamingTemplate('{project}_{panel}_{version}')}
              >
                {t('storyboard.projectSettings.templatePanelBased')} {'{project}_{panel}_{version}'}
                <small>{t('storyboard.projectSettings.templatePanelBasedResult')} Eliot_Panel_01_v001.png</small>
              </button>
              <button 
                type="button" 
                className="template-btn"
                onClick={() => setNamingTemplate('{panel}\\{project}_{panel}_{version}')}
              >
                {t('storyboard.projectSettings.templatePerPanelFolders')} {'{panel}\\{project}_{panel}_{version}'}
                <small>{t('storyboard.projectSettings.templatePerPanelFoldersResult')} Panel_01\Eliot_Panel_01_v001.png</small>
              </button>
              <button 
                type="button" 
                className="template-btn"
                onClick={() => setNamingTemplate('{project}_SHOT{panel}_{version}')}
              >
                {t('storyboard.projectSettings.templateShotBased')} {'{project}_SHOT{panel}_{version}'}
                <small>{t('storyboard.projectSettings.templatePanelBasedResult')} Eliot_SHOTPanel_01_v001.png</small>
              </button>
              <button 
                type="button" 
                className="template-btn"
                onClick={() => setNamingTemplate('{project}_{panel}_{timestamp}')}
              >
                {t('storyboard.projectSettings.templateTimestamped')} {'{project}_{panel}_{timestamp}'}
                <small>{t('storyboard.projectSettings.templatePanelBasedResult')} Eliot_Panel_01_20250206_143022.png</small>
              </button>
              <button 
                type="button" 
                className="template-btn"
                onClick={() => setNamingTemplate('{workflow}_{seed}_{version}')}
              >
                {t('storyboard.projectSettings.templateSeedBased')} {'{workflow}_{seed}_{version}'}
                <small>{t('storyboard.projectSettings.templatePanelBasedResult')} MyWorkflow_12345678_v001.png</small>
              </button>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>{t('storyboard.projectSettings.cancel')}</button>
          <button className="btn-primary" onClick={handleSave}>{t('storyboard.projectSettings.save')}</button>
        </div>
      </div>
      
      {/* Folder Browser Dialog (Tree-based) */}
      <FileBrowserDialog
        isOpen={showFolderBrowser}
        onClose={() => setShowFolderBrowser(false)}
        mode="select-folder"
        orchestratorUrl={orchestratorUrl}
        initialPath={path}
        title={t('storyboard.projectSettings.selectOutputFolder')}
        onOpenProject={() => {}}
        onSelectFolder={(selectedPath) => {
          setPath(selectedPath);
          setShowFolderBrowser(false);
        }}
      />
    </div>
  );
}
