# image-parser

独立浏览器图片库。根入口处理 Blob、参数与编码；/ui 提供原生 DOM 多图面板，/vfs 只读取宿主借入的授权文件视图。
唯一必需运行时依赖为锁定版本的 Scanic。根入口及 /ui 不依赖 vfs-core 或应用包，VFS 是可选 peer；不重新导出 Scanic 类型。
原图不可变，每一步 none/rect/quad 互斥，坐标相对上一步结果；v2 steps 保存已应用几何步骤。导出时合成投影并从原图处理，透视路径使用有界 Canvas 重采样，只在最终结果编码，默认最长边 1024，不放大小图，不逐步重压缩。
面板只生成结果，不提交聊天或持久草稿。prepare 顺序导出，全部成功才返回；宿主负责版本校验、保存与原子替换。
所有异步结果校验代次和 AbortSignal；不声称信号能中断第三方同步计算。释放自己的资源，不关闭宿主文件系统或借入的 processor。
验证：pnpm --filter @itookit/image-parser typecheck / test / build。真实像素、打包安装与浏览器验收另见 README。

自动扫描使用 Scanic classical 检测，限制处理平面且不隐式下载 ML 资源；识别失败保留手动四角，迟到结果不能覆盖手动修改或其他图片。prepare 等待自动检测并支持取消等待。宿主的应用按钮调用 apply 更新当前画布并继续编辑；完成调用 prepare 后持久保存全部结果，成功后替换附件并关闭。取消丢弃整个工作副本，恢复原图清除全部步骤。classical 检测对齐 Scanic demo 的默认 800 内部处理上限，不先缩成发送尺寸。四角编辑使用像素尺寸固定的 Canvas，避免 image.width 与 naturalWidth 混用。

非 ML paper 检测器通过 createImageProcessor({detector: 'paper'}) 显式选择；应用默认仍为 classical，未通过真机与独立样本验收前不更换默认。paper 将候选限制到最长边 480，连通区域与长边提案联合核验，协作式分段计算支持取消、实例销毁和超时；不是 Worker，也不承诺中断解码/Canvas。partial 只有可见候选轮廓，uncertain 只有原因，两者不能构造自动裁剪配方。UI 保留手动选区，完整全图选区视为恒等操作，不重编码。test:detector 独立核验数值、公共调用链、数据集和浏览器要求；报告不得把 Chromium 节流当作 Safari 真机。
