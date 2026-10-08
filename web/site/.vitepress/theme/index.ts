import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import ResponsiveImage from './components/ResponsiveImage.vue'
import './style.css'

export default { Layout, enhanceApp({ app }) { app.component('ResponsiveImage', ResponsiveImage) } } satisfies Theme
