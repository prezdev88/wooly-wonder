import { useState, useRef, useEffect } from 'react'
import ImagePixelator from './components/ImagePixelator'
import type { Project, ProjectImage, SavedColor } from './types'
import './index.css'

const THEMES = [
  { id: 'purple', name: 'Morado Real', accent: '#9D4EDD', hover: '#C77DFF' },
  { id: 'orange', name: 'Terracota', accent: '#E07A5F', hover: '#F4A261' },
  { id: 'green', name: 'Bosque', accent: '#2A9D8F', hover: '#45B8AA' },
  { id: 'blue', name: 'Océano', accent: '#3A86FF', hover: '#6BA2FF' },
  { id: 'pink', name: 'Chicle', accent: '#FF006E', hover: '#FF4D99' },
];

function App() {
  const [themeId, setThemeId] = useState(localStorage.getItem('themeId') || 'purple');
  const [customColor, setCustomColor] = useState(localStorage.getItem('customThemeColor') || '#FF0055');
  const [showSettings, setShowSettings] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<ProjectImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getProjects().then(setProjects);
    }
  }, []);

  useEffect(() => {
    let accent, hover;
    if (themeId === 'custom') {
      accent = customColor;
      hover = customColor; // Para simplificar, el hover es el mismo color (o podríamos aclararlo)
    } else {
      const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
      accent = theme.accent;
      hover = theme.hover;
    }
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-hover', hover);
    localStorage.setItem('themeId', themeId);
    if (themeId === 'custom') {
      localStorage.setItem('customThemeColor', customColor);
    }
  }, [themeId, customColor]);

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
      name: `Nuevo Proyecto ${projects.length + 1}`,
      images: []
    };
    if (window.electronAPI) {
      const updated = await window.electronAPI.saveProject(newProject);
      setProjects(updated);
      setActiveProjectId(newProject.id);
      setActiveImage(null);
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('¿Estás seguro de que deseas eliminar este proyecto por completo?')) {
      if (window.electronAPI) {
        const updated = await window.electronAPI.deleteProject(id);
        setProjects(updated);
        if (activeProjectId === id) {
          setActiveProjectId(null);
          setActiveImage(null);
        }
      }
    }
  };

  const deleteImage = async (imgId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('¿Estás seguro de que deseas eliminar esta foto del proyecto?')) {
      if (!activeProject) return;
      const updatedProject = { 
        ...activeProject, 
        images: activeProject.images.filter(img => img.id !== imgId) 
      };
      setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
      if (window.electronAPI) {
        await window.electronAPI.saveProject(updatedProject);
      }
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
    
    if (window.electronAPI) {
      const updatedProjects = await window.electronAPI.saveProject(updatedProject);
      setProjects(updatedProjects);
      
      if (targetProject) {
        setActiveProjectId(targetProject.id);
      }
      
      if (newImages.length === 1) {
        setActiveImage(newImages[0]);
      }
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
            const newProj: Project = { id: Date.now().toString(), name: 'Nuevo Proyecto', images: [] };
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
    if (window.electronAPI) {
      await window.electronAPI.saveProject(updatedProject);
    }
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
    
    if (window.electronAPI) {
      await window.electronAPI.saveProject(updatedProject);
    }
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
    
    if (window.electronAPI) {
      await window.electronAPI.saveProject(updatedProject);
    }
  };

  const handleUpdateCurrentRow = (row: number | null) => {
    if (!activeProject || !activeImage) return;
    
    const updatedImage = { ...activeImage, currentRow: row };
    const updatedImages = activeProject.images.map(img => 
      img.id === activeImage.id ? updatedImage : img
    );
    const updatedProject = { ...activeProject, images: updatedImages };
    
    setProjects(projects.map(p => p.id === activeProject.id ? updatedProject : p));
    if (window.electronAPI) {
      window.electronAPI.saveProject(updatedProject);
    }
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
    if (window.electronAPI) {
      await window.electronAPI.saveProject(updatedProject);
    }
    setActiveImage(updatedImage);
  };

  return (
    <>
      {!isFocusMode && (
        <header className="app-header">
          <h1>Wooly Wonder 🧶</h1>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', WebkitAppRegion: 'no-drag', flex: 1, textAlign: 'center' } as any}>
            {activeProject ? activeProject.name : 'Mis Patrones'}
          </div>
        <div style={{ WebkitAppRegion: 'no-drag', position: 'relative' } as any}>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.4rem', padding: '0 8px' }}
            title="Preferencias"
          >
            🎨
          </button>
          
          {showSettings && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '16px',
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
              borderRadius: '12px',
              padding: '16px',
              backdropFilter: 'blur(30px)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
              zIndex: 100,
              minWidth: '220px'
            }}>
              <h4 style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500, letterSpacing: '0.5px' }}>TEMA DE LA APP</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => {
                      setThemeId(theme.id);
                      setShowSettings(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      background: themeId === theme.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: '1px solid',
                      borderColor: themeId === theme.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      color: themeId === theme.id ? theme.accent : 'var(--text-main)',
                      fontWeight: themeId === theme.id ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      width: '100%',
                      textAlign: 'left'
                    }}
                    onMouseOver={(e) => {
                      if (themeId !== theme.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseOut={(e) => {
                      if (themeId !== theme.id) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ 
                      width: '16px', 
                      height: '16px', 
                      borderRadius: '50%', 
                      background: theme.accent,
                      boxShadow: `0 0 10px ${theme.accent}80`
                    }}></div>
                    {theme.name}
                  </button>
                ))}
                  
                  <div 
                    onClick={() => setThemeId('custom')}
                    style={{
                      background: themeId === 'custom' ? 'rgba(255,255,255,0.1)' : 'transparent',
                      border: '1px solid',
                      borderColor: themeId === 'custom' ? 'var(--accent)' : 'var(--panel-border)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'var(--transition)'
                    }}
                  >
                    <input 
                      type="color" 
                      value={themeId === 'custom' ? customColor : '#ffffff'}
                      onChange={(e) => {
                        setCustomColor(e.target.value);
                        setThemeId('custom');
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        width: '24px', 
                        height: '24px', 
                        padding: 0, 
                        border: 'none', 
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: 'none'
                      }}
                    />
                    <span style={{ fontSize: '1rem', color: themeId === 'custom' ? 'var(--accent)' : 'var(--text-main)', fontWeight: themeId === 'custom' ? 600 : 400, flex: 1 }}>
                      Color Libre
                    </span>
                  </div>
              </div>
            </div>
          )}
        </div>
      </header>
      )}

      <div className="app-container">
        {!isFocusMode && (
          <aside className="sidebar">
            <div className="sidebar-header">
              <button className="new-btn" onClick={createProject}>+ Nuevo Proyecto</button>
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
                <span>{project.name || 'Sin título'}</span>
                <button className="delete-btn" onClick={(e) => deleteProject(project.id, e)} title="Eliminar proyecto">
                  ×
                </button>
              </div>
            ))}
            {projects.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px', fontSize: '0.9rem' }}>
                No tienes proyectos aún.
              </div>
            )}
          </div>
        </aside>
        )}

        <main className="main-content" style={{ padding: isFocusMode ? '0' : '40px' }}>
          {!activeProject ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <h3>Selecciona o crea un proyecto en el menú</h3>
            </div>
          ) : activeImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isFocusMode ? '0' : '20px', height: '100%' }}>
              {!isFocusMode && (
                <button className="back-btn" onClick={() => setActiveImage(null)}>
                  ← Volver a {activeProject.name}
                </button>
              )}
              <ImagePixelator 
                key={activeImage.id}
                imageUrl={activeImage.url} 
                palette={activeImage.palette || []}
                onUpdatePalette={handleUpdatePalette}
                initialPixelSize={activeImage.pixelSize}
                onUpdatePixelSize={handleUpdatePixelSize}
                currentRow={activeImage.currentRow}
                onUpdateCurrentRow={handleUpdateCurrentRow}
                markedPixel={activeImage.markedPixel}
                onUpdateMarkedPixel={handleUpdateMarkedPixel}
                isFocusMode={isFocusMode}
                onSetFocus={setIsFocusMode}
                projectName={activeProject.name || 'Proyecto sin título'}
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
                placeholder="Nombre del proyecto"
              />
              
              <div className="gallery">
                {activeProject.images.map(img => (
                  <div key={img.id} className="gallery-item" onClick={() => setActiveImage(img)}>
                    <img src={img.url} alt={img.filename} />
                    <button 
                      className="delete-img-btn"
                      onClick={(e) => deleteImage(img.id, e)}
                      title="Eliminar foto"
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
                  <span style={{ fontSize: '0.9rem' }}>Subir imagen</span>
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
            <h2 style={{ margin: '0 0 20px 0', fontSize: '1.4rem' }}>¿Dónde quieres guardar la imagen pegada?</h2>
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
                  {p.name || 'Sin título'}
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
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
