export interface ProjectImage {
  id: string;
  url: string;
  filename: string;
  palette?: SavedColor[];
  pixelSize?: number;
}

export interface SavedColor {
  id: string;
  hex: string;
  r: number;
  g: number;
  b: number;
  name?: string;
}

export interface Project {
  id: string;
  name: string;
  images: ProjectImage[];
}

declare global {
  interface Window {
    electronAPI: {
      getProjects: () => Promise<Project[]>;
      saveProject: (p: Project) => Promise<Project[]>;
      deleteProject: (id: string) => Promise<Project[]>;
      saveImage: (data: { base64Data: string; filename: string }) => Promise<string>;
      showOpenDialog: (options: any) => Promise<any>;
    };
  }
}
