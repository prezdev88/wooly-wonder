import { useState, useRef, useEffect } from 'react'
import ImagePixelator from './components/ImagePixelator'
import type { Project, ProjectImage, SavedColor } from './types'
import './index.css'

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<ProjectImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getProjects().then(setProjects);
    }
  }, []);

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
    if (window.electronAPI) {
      const updated = await window.electronAPI.deleteProject(id);
      setProjects(updated);
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setActiveImage(null);
      }
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!activeProject || !file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string;
      if (window.electronAPI) {
        const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        const newImage: ProjectImage = { id: Date.now().toString(), url: base64Data, filename };
        const updatedProject = { ...activeProject, images: [...activeProject.images, newImage] };
        const updatedProjects = await window.electronAPI.saveProject(updatedProject);
        setProjects(updatedProjects);
        setActiveImage(newImage); // Auto-open the new image
      }
    };
    reader.readAsDataURL(file);
  };

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
      handleFileUpload(e.dataTransfer.files[0]);
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

  return (
    <>
      <header className="app-header">
        <h1>Pixel It 🧶</h1>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', WebkitAppRegion: 'no-drag' as any }}>
          {activeProject ? activeProject.name : 'Mis Patrones'}
        </div>
      </header>

      <div className="app-container">
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

        <main className="main-content">
          {!activeProject ? (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <h3>Selecciona o crea un proyecto en el menú</h3>
            </div>
          ) : activeImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
              <button className="back-btn" onClick={() => setActiveImage(null)}>
                ← Volver a {activeProject.name}
              </button>
              <ImagePixelator 
                key={activeImage.id}
                imageUrl={activeImage.url} 
                palette={activeImage.palette || []}
                onUpdatePalette={handleUpdatePalette}
                initialPixelSize={activeImage.pixelSize}
                onUpdatePixelSize={handleUpdatePixelSize}
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
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileUpload(e.target.files[0]);
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
    </>
  )
}

export default App
