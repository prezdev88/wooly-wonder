# Etapa de construcción (Build)
FROM node:24-alpine as builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json ./

# Instalar dependencias
RUN npm ci

# Copiar el resto del código
COPY . .

# Compilar la aplicación React/Vite para producción
RUN npm run build

# Etapa de producción (Servir con Nginx)
FROM nginx:alpine

# Copiar los archivos compilados de React a la carpeta pública de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar una configuración básica de Nginx para manejar rutas de React (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
