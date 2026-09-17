# 合成演示说明

此材料只用于工作台功能验收，不对应任何真实论文。

流程：节点特征 → MeanPool → 与第二侧特征拼接 → 线性评分 → sigmoid → 二元交叉熵。

代码位置：model.py 中的 MeanPool、PairEncoder、AssociationModel、binary_loss，以及 train.py 中的 smoke。

模型没有图消息传递，也不代表药物或蛋白的真实测量。一次梯度下降检查只用于确认导出工程可以执行。
