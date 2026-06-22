FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY about.html /usr/share/nginx/html/about.html
COPY guide.html /usr/share/nginx/html/guide.html
COPY contact.html /usr/share/nginx/html/contact.html
COPY privacy.html /usr/share/nginx/html/privacy.html
COPY terms.html /usr/share/nginx/html/terms.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY nav.js /usr/share/nginx/html/nav.js
COPY favicon.png /usr/share/nginx/html/favicon.png
COPY blog/ /usr/share/nginx/html/blog/
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
