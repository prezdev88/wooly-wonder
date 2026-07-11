# 📝 Lista de Tareas para Preparar Wooly Wonder para Steam

Esta es nuestra hoja de ruta (roadmap) para llevar la aplicación desde su estado actual hasta un producto comercial completo, listo para ser vendido en plataformas como Steam o itch.io.

## 📦 1. Empaquetado y Distribución Profesional
- [ ] Configurar `electron-builder` en el `package.json` para generar ejecutables limpios y optimizados.
- [ ] Crear y configurar el ícono oficial de la aplicación (en formatos `.ico`, `.icns` y `.png`).
- [ ] Asegurarnos de que el ejecutable funcione correctamente como un programa independiente (standalone app) sin requerir comandos de desarrollo.
- [ ] (Opcional) Integrar `steamworks.js` si deseamos guardar los proyectos directamente en Steam Cloud.

## 🖨️ 2. Exportación de Patrones
- [x] Añadir un botón de "Exportar Patrón".
- [x] Implementar exportación a PDF (para que la usuaria pueda imprimir fácilmente el diseño en hojas A4).
- [x] Implementar exportación a Imagen de Alta Resolución (PNG/JPG), incluyendo la cuadrícula, los números de las filas/columnas y la paleta de colores seleccionada al lado.

## 🌍 3. Internacionalización (Localización)
- [x] Configurar un sistema de idiomas (como `i18next`).
- [x] Extraer todo el texto "duro" de la aplicación (botones, menús, confirmaciones) a archivos de traducción.
- [x] Crear la traducción completa al Inglés.
- [x] Añadir un selector de idioma en el panel de configuración (⚙️) para cambiar entre Inglés y Español en tiempo real.

## 🐛 4. Pulido Final y Quality Assurance (QA)
- [ ] Revisión exhaustiva de rendimiento: Asegurarnos de que al subir una imagen 4K gigante no se congele el programa.
- [ ] Revisar el comportamiento y estética de los scrollbars en Windows.
- [ ] Probar la aplicación en distintos tamaños de pantalla para validar la responsividad (especialmente pantallas de laptops pequeñas de 13 pulgadas).

## 🌐 5. Presencia Web y Soporte
- [x] Crear una página web promocional (Landing Page) totalmente gratuita usando GitHub Pages para exhibir la aplicación.
- [ ] Configurar un correo de soporte básico para cumplir con los requisitos de publicación de Steam.
