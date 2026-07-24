import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';

const router=createRouter({history:createWebHistory(),routes:[
 {path:'/login',name:'login',component:{template:'<div />'}},
 {path:'/:pathMatch(.*)*',name:'console',component:{template:'<div />'}}
]});
router.beforeEach((to)=>{if(to.path!=='/login'&&!localStorage.getItem('admin_token'))return '/login';});
createApp(App).use(router).mount('#app');
