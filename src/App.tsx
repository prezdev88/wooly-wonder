import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import ImagePixelator from './components/ImagePixelator'
import SettingsDialog from './components/SettingsDialog'
import type { Project, ProjectImage, SavedColor } from './types'
import localforage from 'localforage'
import './index.css'

const THEMES = [
  { id: 'dracula', nameKey: 'draculaTheme', bg: '#282A36', panel: '#44475A', border: 'rgba(255, 255, 255, 0.1)', textMain: '#F8F8F2', textMuted: '#6272A4', accent: '#FF79C6', hover: '#FF92DF' },
  { id: 'light-blue', nameKey: 'lightBlue', bg: '#F8F9FA', panel: '#FFFFFF', border: 'rgba(0, 0, 0, 0.08)', textMain: '#212529', textMuted: '#6C757D', accent: '#3A86FF', hover: '#6BA2FF' },
  { id: 'sepia', nameKey: 'sepiaTheme', bg: '#F4E1D2', panel: '#E8D5C4', border: 'rgba(0, 0, 0, 0.05)', textMain: '#5E4A3D', textMuted: '#8A7A6E', accent: '#E07A5F', hover: '#F4A261' },
];

function App() {
  const { t, i18n } = useTranslation();
  const [themeId, setThemeId] = useState(localStorage.getItem('themeId') || 'dracula');
  const [customTheme, setCustomTheme] = useState(() => {
    const saved = localStorage.getItem('customTheme');
    return saved ? JSON.parse(saved) : {
      bg: '#1A1816',
      panel: '#2a2724',
      border: 'rgba(255, 255, 255, 0.08)',
      textMain: '#F4F1DE',
      textMuted: '#A8A497',
      accent: '#FF0055',
      hover: '#FF4D99'
    };
  });
  const [showSettings, setShowSettings] = useState(false);
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'es');
  const [areSettingsLoaded, setAreSettingsLoaded] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<ProjectImage | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [showAppFab, setShowAppFab] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        if (window.electronAPI && window.electronAPI.getSettings) {
          const settings = await window.electronAPI.getSettings();
          if (settings.themeId) setThemeId(settings.themeId);
          if (settings.customTheme) setCustomTheme(settings.customTheme);
          if (settings.language) {
            setLanguage(settings.language);
            i18n.changeLanguage(settings.language);
          }
        } else {
          const settings = (await localforage.getItem<any>('settings')) || {};
          if (settings.themeId) setThemeId(settings.themeId);
          if (settings.customTheme) setCustomTheme(settings.customTheme);
          if (settings.language) {
            setLanguage(settings.language);
            i18n.changeLanguage(settings.language);
          }
        }
      } catch (e) {
        console.error("Error loading settings", e);
      } finally {
        setAreSettingsLoaded(true);
      }
    };
    fetchSettings();

    const fetchProjects = async () => {
      if (window.electronAPI) {
        const projs = await window.electronAPI.getProjects();
        setProjects(projs);
        if (window.electronAPI.getAppVersion) {
          window.electronAPI.getAppVersion().then(setAppVersion);
        }
      } else {
        const projs = (await localforage.getItem<Project[]>('projects')) || [];
        setProjects(projs);
      }
    };
    fetchProjects();
  }, [i18n]);

  const saveProjectData = async (project: Project) => {
    if (window.electronAPI) {
      return await window.electronAPI.saveProject(project);
    } else {
      let currentProjects = [...projects];
      const idx = currentProjects.findIndex(p => p.id === project.id);
      if (idx >= 0) currentProjects[idx] = project;
      else currentProjects.push(project);
      await localforage.setItem('projects', currentProjects);
      return currentProjects;
    }
  };

  const deleteProjectData = async (id: string) => {
    if (window.electronAPI) {
      return await window.electronAPI.deleteProject(id);
    } else {
      const newProjects = projects.filter(p => p.id !== id);
      await localforage.setItem('projects', newProjects);
      return newProjects;
    }
  };

  useEffect(() => {
    if (!areSettingsLoaded) return;

    let theme;
    if (themeId === 'custom') {
      theme = customTheme;
    } else {
      theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    }
    document.documentElement.style.setProperty('--bg-color', theme.bg);
    document.documentElement.style.setProperty('--panel-bg', theme.panel);
    document.documentElement.style.setProperty('--panel-border', theme.border);
    document.documentElement.style.setProperty('--text-main', theme.textMain);
    document.documentElement.style.setProperty('--text-muted', theme.textMuted);
    document.documentElement.style.setProperty('--accent', theme.accent);
    document.documentElement.style.setProperty('--accent-hover', theme.hover);

    const getContrastYIQ = (hexcolor: string) => {
      if (!hexcolor || hexcolor.startsWith('rgb')) return '#FFFFFF';
      hexcolor = hexcolor.replace("#", "");
      if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join('');
      const r = parseInt(hexcolor.substring(0,2),16);
      const g = parseInt(hexcolor.substring(2,4),16);
      const b = parseInt(hexcolor.substring(4,6),16);
      const yiq = ((r*299)+(g*587)+(b*114))/1000;
      return (yiq >= 128) ? '#1A1A1A' : '#FFFFFF';
    };
    document.documentElement.style.setProperty('--accent-text', getContrastYIQ(theme.accent));

    if (!window.electronAPI) {
      localStorage.setItem('themeId', themeId);
      localStorage.setItem('customTheme', JSON.stringify(customTheme));
      localStorage.setItem('language', language);
    }

    const settingsToSave = { themeId, customTheme, language };
    if (window.electronAPI && window.electronAPI.saveSettings) {
      window.electronAPI.saveSettings(settingsToSave).catch(e => console.error("Error saving settings", e));
    } else {
      localforage.setItem('settings', settingsToSave).catch(e => console.error("Error saving settings", e));
    }
  }, [areSettingsLoaded, customTheme, language, themeId]);

  const changeLanguage = (newLanguage: string) => {
    setLanguage(newLanguage);
    i18n.changeLanguage(newLanguage);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode]);

  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  const createProject = async () => {
    const newProject: Project = {
      id: Date.now().toString(),
      name: `${t('project.newProjectDefault')} ${projects.length + 1}`,
      images: []
    };
    const updated = await saveProjectData(newProject);
    setProjects(updated);
    setActiveProjectId(newProject.id);
    setActiveImage(null);
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('project.confirmDeleteProject'))) {
      const updated = await deleteProjectData(id);
      setProjects(updated);
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setActiveImage(null);
      }
    }
  };

  const deleteImage = async (imgId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('project.confirmDeletePhoto'))) {
      if (!activeProject) return;
      const updatedProject = { 
        ...activeProject, 
        images: activeProject.images.filter(img => img.id !== imgId) 
      };
      const updatedProjects = await saveProjectData(updatedProject);
      setProjects(updatedProjects);
    }
  };

  const handleFileUpload = async (files: FileList | File[], targetProject?: Project) => {
    const proj = targetProject || activeProject;
    if (!proj) return;
    
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;
    
    const newImages = await Promise.all(fileArray.map(file => {
      return new Promise<ProjectImage>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Data = e.target?.result as string;
          const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          resolve({ 
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5), 
            url: base64Data, 
            filename 
          });
        };
        reader.readAsDataURL(file);
      });
    }));

    const updatedProject = { ...proj, images: [...proj.images, ...newImages] };
    
    const updatedProjects = await saveProjectData(updatedProject);
    setProjects(updatedProjects);
    
    if (targetProject) {
      setActiveProjectId(targetProject.id);
    }
    
    if (newImages.length === 1) {
      setActiveImage(newImages[0]);
    }
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
      if (imageItems.length > 0) {
        const file = imageItems[0].getAsFile();
        if (file) {
          if (activeProject) {
            handleFileUpload([file]);
          } else if (projects.length === 0) {
            const newProj: Project = { id: Date.now().toString(), name: t('project.newProjectDefault'), images: [] };
            handleFileUpload([file], newProj);
          } else {
            setPastedFile(file);
          }
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [activeProject, projects]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleProjectNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeProject) return;
    const updatedProject = { ...activeProject, name: e.target.value };
    // Optimistic update
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    await saveProjectData(updatedProject);
  };

  const handleUpdatePalette = async (newPalette: SavedColor[]) => {
    if (!activeProject || !activeImage) return;
    
    const updatedImage = { ...activeImage, palette: newPalette };
    const updatedProject = { 
      ...activeProject, 
      images: activeProject.images.map(img => img.id === activeImage.id ? updatedImage : img) 
    };
    
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    setActiveImage(updatedImage);
    
    await saveProjectData(updatedProject);
  };

  const handleUpdateImageUrl = async (newUrl: string) => {
    if (!activeProject || !activeImage) return;
    
    const updatedImage = { ...activeImage, url: newUrl };
    const updatedProject = { 
      ...activeProject, 
      images: activeProject.images.map(img => img.id === activeImage.id ? updatedImage : img) 
    };
    
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    setActiveImage(updatedImage);
    
    await saveProjectData(updatedProject);
  };

  const handleUpdateCompletedSegments = async (segments: Record<number, number[]>) => {
    if (!activeProject || !activeImage) return;
    const updatedImage = { ...activeImage, completedSegments: segments };
    const updatedProject = {
      ...activeProject,
      images: activeProject.images.map(img => img.id === activeImage.id ? updatedImage : img)
    };
    const updatedProjects = await saveProjectData(updatedProject);
    setProjects(updatedProjects);
    setActiveImage(updatedImage);
  };

  const handleUpdatePixelSize = async (newPixelSize: number) => {
    if (!activeProject || !activeImage) return;
    
    const updatedImage = { ...activeImage, pixelSize: newPixelSize };
    const updatedProject = { 
      ...activeProject, 
      images: activeProject.images.map(img => img.id === activeImage.id ? updatedImage : img) 
    };
    
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    setActiveImage(updatedImage);
    
    await saveProjectData(updatedProject);
  };

  const handleUpdatePixelSizeLocked = async (isLocked: boolean) => {
    if (!activeProject || !activeImage) return;
    
    const updatedImage = { ...activeImage, isPixelSizeLocked: isLocked };
    const updatedProject = { 
      ...activeProject, 
      images: activeProject.images.map(img => img.id === activeImage.id ? updatedImage : img) 
    };
    
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    setActiveImage(updatedImage);
    
    await saveProjectData(updatedProject);
  };

  const handleUpdateCurrentRow = (row: number | null) => {
    if (!activeProject || !activeImage) return;
    
    const updatedImage = { ...activeImage, currentRow: row };
    const updatedImages = activeProject.images.map(img => 
      img.id === activeImage.id ? updatedImage : img
    );
    const updatedProject = { ...activeProject, images: updatedImages };
    
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    saveProjectData(updatedProject);
    setActiveImage(updatedImage);
  };

  const handleUpdateMarkedPixel = async (pixel: { x: number, y: number } | null) => {
    if (!activeProject || !activeImage) return;
    
    const updatedImage = { ...activeImage, markedPixel: pixel };
    const updatedImages = activeProject.images.map(img => 
      img.id === activeImage.id ? updatedImage : img
    );
    const updatedProject = { ...activeProject, images: updatedImages };
    
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    await saveProjectData(updatedProject);
    setActiveImage(updatedImage);
  };

  return (
    <>
      {!isFocusMode && (
        <header className="app-header">
          <h1>{t('app.title')}</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', WebkitAppRegion: 'no-drag', flex: 1, textAlign: 'center' } as any}>
            {activeProject ? activeProject.name : t('app.myPatterns')}
          </div>
        <div style={{ WebkitAppRegion: 'no-drag', position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' } as any}>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.4rem', padding: '0 8px' }}
            title={t('app.preferences')}
          >
            ⚙️
          </button>
          {window.electronAPI && (
            <>
              <button 
                onClick={() => window.electronAPI.minimizeApp()}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px', opacity: 0.7 }}
                title={t('app.minimize')}
              >
                —
              </button>
              <button 
                onClick={() => window.electronAPI.closeApp()}
                style={{ background: 'transparent', border: 'none', color: '#ff5f56', cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px', fontWeight: 'bold' }}
                title={t('app.close')}
              >
                ✕
              </button>
            </>
          )}
          
        </div>
      </header>
      )}

      {showSettings && (
        <SettingsDialog
          appVersion={appVersion}
          customTheme={customTheme}
          onClose={() => setShowSettings(false)}
          onCustomThemeChange={setCustomTheme}
          language={language}
          onLanguageChange={changeLanguage}
          onThemeChange={setThemeId}
          themeId={themeId}
          themes={THEMES}
        />
      )}

      <div className="app-container">
        {!isFocusMode && (
          <aside className="sidebar">
            <div className="sidebar-header desktop-only">
              <button className="new-btn" onClick={createProject}>{t('project.newProject')}</button>
            </div>
          <div className="project-list">
            {projects.map(project => (
              <div 
                key={project.id} 
                className={`project-item ${activeProjectId === project.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveProjectId(project.id);
                  setActiveImage(null);
                }}
              >
                <span>{project.name || t('project.untitled')}</span>
                <button className="delete-btn" onClick={(e) => deleteProject(project.id, e)} title={t('project.deleteProject')}>
                  ×
                </button>
              </div>
            ))}
            {projects.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px', fontSize: '0.9rem' }}>
                {t('project.noProjects')}
              </div>
            )}
          </div>
        </aside>
        )}

        <main className="main-content" style={{ padding: isFocusMode ? '0' : '40px' }}>
          {!activeProject ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <h3>{t('project.selectOrCreate')}</h3>
            </div>
          ) : activeImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isFocusMode ? '0' : '20px', height: '100%' }}>

              <ImagePixelator 
                key={activeImage.id}
                imageUrl={activeImage.url} 
                palette={activeImage.palette || []}
                onUpdatePalette={handleUpdatePalette}
                initialPixelSize={activeImage.pixelSize}
                onUpdatePixelSize={handleUpdatePixelSize}
                isPixelSizeLocked={activeImage.isPixelSizeLocked}
                onUpdatePixelSizeLocked={handleUpdatePixelSizeLocked}
                currentRow={activeImage.currentRow}
                onUpdateCurrentRow={handleUpdateCurrentRow}
                markedPixel={activeImage.markedPixel}
                onUpdateMarkedPixel={handleUpdateMarkedPixel}
                completedSegments={activeImage.completedSegments}
                onUpdateCompletedSegments={handleUpdateCompletedSegments}
                isFocusMode={isFocusMode}
                onSetFocus={setIsFocusMode}
                projectName={activeProject.name || t('project.untitledProject')}
                onCreateProject={createProject}
                onUpdateImageUrl={handleUpdateImageUrl}
              />
            </div>
          ) : (
            <div className="fade-in">
              <input 
                type="text" 
                value={activeProject.name} 
                onChange={handleProjectNameChange}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid var(--panel-border)',
                  color: 'var(--text-main)',
                  fontSize: '2rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  padding: '8px 0',
                  width: '100%',
                  marginBottom: '20px'
                }}
                placeholder={t('project.projectName')}
              />
              
              <div className="gallery">
                {activeProject.images.map(img => (
                  <div key={img.id} className="gallery-item" onClick={() => setActiveImage(img)}>
                    <img src={img.url} alt={img.filename} />
                    <button 
                      className="delete-img-btn"
                      onClick={(e) => deleteImage(img.id, e)}
                      title={t('project.deletePhoto')}
                    >
                      ×
                    </button>
                  </div>
                ))}
                
                <div 
                  className={`gallery-item add-new ${isDragging ? 'drag-over' : ''}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span style={{ fontSize: '2rem', marginBottom: '8px' }}>+</span>
                  <span style={{ fontSize: '0.9rem' }}>{t('project.uploadImage')}</span>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(e.target.files);
                        // Reset input so same file can be selected again
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {!activeImage && createPortal(
        <div className="mobile-fab-container">
           <div className={`fab-menu ${showAppFab ? 'open' : ''}`}>
             <button className="fab-pill" onClick={() => { createProject(); setShowAppFab(false); }} title={t('project.newProject')}>
               <span className="fab-pill-text">{t('project.newProject')}</span>
             </button>
           </div>
           <button className="fab-main" onClick={() => setShowAppFab(!showAppFab)}>
             {showAppFab ? '✕' : '⋮'}
           </button>
        </div>,
        document.body
      )}

      {pastedFile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            background: 'var(--panel-bg)', padding: '30px', borderRadius: '12px',
            border: '1px solid var(--panel-border)', minWidth: '400px', maxWidth: '90%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '1.4rem' }}>{t('project.whereToSave')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '60vh', overflowY: 'auto' }}>
              {projects.map(p => (
                <button 
                  key={p.id}
                  onClick={() => {
                    handleFileUpload([pastedFile], p);
                    setPastedFile(null);
                  }}
                  style={{
                    padding: '16px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-main)',
                    textAlign: 'left', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '1rem', transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  {p.name || t('project.untitled')}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button 
                onClick={() => setPastedFile(null)}
                style={{
                  background: 'transparent', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.5)',
                  padding: '8px 20px', borderRadius: '6px', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,107,107,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {t('project.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
