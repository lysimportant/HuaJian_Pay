import axios from 'axios';
export const api=axios.create({baseURL:'/admin/api',timeout:10000});
api.interceptors.request.use(c=>{const token=localStorage.getItem('admin_token');if(token)c.headers.Authorization=`Bearer ${token}`;return c;});
api.interceptors.response.use(r=>r.data,e=>{if(e.response?.status===401){localStorage.removeItem('admin_token');if(location.pathname!=='/login')location.href='/login';}return Promise.reject(e);});
