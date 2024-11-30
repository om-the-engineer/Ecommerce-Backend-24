import { TryCatch } from "../middlewares/error.js";
import { Order } from "../models/order.js";
import { Product } from "../models/product.js";
import { User } from "../models/user.js";
import {
  calculatePercentage,
  getInventories,
  getChartData,
} from "../utils/features.js";

export const getDashboardStats = TryCatch(async (req, res, next) => {
  const today = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const thisMonth = {
    start: new Date(today.getFullYear(), today.getMonth(), 1),
    end: today,
  };

  const lastMonth = {
    start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
    end: new Date(today.getFullYear(), today.getMonth(), 0),
  };

  const [
    thisMonthProducts,
    thisMonthUsers,
    thisMonthOrders,
    lastMonthProducts,
    lastMonthUsers,
    lastMonthOrders,
    productsCount,
    usersCount,
    allOrders,
    lastSixMonthOrders,
    categories,
    femaleUsersCount,
    latestTransaction,
  ] = await Promise.all([
    Product.find({
      createdAt: {
        $gte: thisMonth.start,
        $lte: thisMonth.end,
      },
    }),
    User.find({
      createdAt: {
        $gte: thisMonth.start,
        $lte: thisMonth.end,
      },
    }),
    Order.find({
      createdAt: {
        $gte: thisMonth.start,
        $lte: thisMonth.end,
      },
    }),
    Product.find({
      createdAt: {
        $gte: lastMonth.start,
        $lte: lastMonth.end,
      },
    }),
    User.find({
      createdAt: {
        $gte: lastMonth.start,
        $lte: lastMonth.end,
      },
    }),
    Order.find({
      createdAt: {
        $gte: lastMonth.start,
        $lte: lastMonth.end,
      },
    }),
    Product.countDocuments(),
    User.countDocuments(),
    Order.find({}).select("total"),
    Order.find({
      createdAt: {
        $gte: sixMonthsAgo,
        $lte: today,
      },
    }),
    Product.distinct("category"),
    User.countDocuments({ gender: "female" }),
    Order.find({})
      .select(["orderItems", "discount", "total", "status"])
      .limit(4),
  ]);

  const thisMonthRevenue = thisMonthOrders.reduce(
    (total, order) => total + (order.total || 0),
    0
  );

  const lastMonthRevenue = lastMonthOrders.reduce(
    (total, order) => total + (order.total || 0),
    0
  );

  const categoryCount = await getInventories({
    categories,
    productsCount,
  });

  const stats = {
    categoryCount,
    changePercent: {
      revenue: calculatePercentage(thisMonthRevenue, lastMonthRevenue),
      product: calculatePercentage(
        thisMonthProducts.length,
        lastMonthProducts.length
      ),
      user: calculatePercentage(thisMonthUsers.length, lastMonthUsers.length),
      order: calculatePercentage(
        thisMonthOrders.length,
        lastMonthOrders.length
      ),
    },
    count: {
      revenue: thisMonthRevenue,
      product: productsCount,
      user: usersCount,
      order: allOrders.length,
    },
    chart: {
      order: lastSixMonthOrders,
      revenue: lastSixMonthOrders,
    },
    userRatio: {
      male: usersCount - femaleUsersCount,
      female: femaleUsersCount,
    },
    latestTransaction: latestTransaction.map((i) => ({
      _id: i._id,
      discount: i.discount,
      amount: i.total,
      quantity: i.orderItems.length,
      status: i.status,
    })),
  };

  return res.status(200).json({
    success: true,
    stats,
  });
});

export const getPieCharts = TryCatch(async (req, res, next) => {
  const [
    processingOrder,
    shippedOrder,
    deliveredOrder,
    categories,
    productsCount,
    outOfStock,
    allOrders,
    allUsers,
    adminUsers,
    customerUsers,
  ] = await Promise.all([
    Order.countDocuments({ status: "Processing" }),
    Order.countDocuments({ status: "Shipped" }),
    Order.countDocuments({ status: "Delivered" }),
    Product.distinct("category"),
    Product.countDocuments(),
    Product.countDocuments({ stock: 0 }),
    Order.find({}).select([
      "total",
      "discount",
      "subtotal",
      "tax",
      "shippingCharges",
    ]),
    User.find({}).select(["dob"]),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ role: "user" }),
  ]);

  const orderFullfillment = {
    processing: processingOrder,
    shipped: shippedOrder,
    delivered: deliveredOrder,
  };

  const productCategories = await getInventories({
    categories,
    productsCount,
  });

  const stockAvailability = {
    inStock: productsCount - outOfStock,
    outOfStock,
  };

  const grossIncome = allOrders.reduce(
    (prev, order) => prev + (order.total || 0),
    0
  );

  const discount = allOrders.reduce(
    (prev, order) => prev + (order.discount || 0),
    0
  );

  const productionCost = allOrders.reduce(
    (prev, order) => prev + (order.subtotal || 0),
    0
  ) * 0.3;

  const burnt = allOrders.reduce(
    (prev, order) => prev + (order.tax || 0) + (order.shippingCharges || 0),
    0
  );

  const marketingCost = Math.round(grossIncome * (30 / 100));
  const netMargin = grossIncome - discount - productionCost - burnt - marketingCost;

  const revenueDistribution = {
    netMargin,
    discount,
    productionCost,
    burnt,
    marketingCost,
  };

  const usersAgeGroup = {
    teen: allUsers.filter((i) => i.age < 20).length,
    adult: allUsers.filter((i) => i.age >= 20 && i.age < 40).length,
    old: allUsers.filter((i) => i.age >= 40).length,
  };

  const adminCustomer = {
    admin: adminUsers,
    customer: customerUsers,
  };

  return res.status(200).json({
    success: true,
    charts: {
      orderFullfillment,
      productCategories,
      stockAvailability,
      revenueDistribution,
      usersAgeGroup,
      adminCustomer,
    },
  });
});

export const getBarCharts = TryCatch(async (req, res, next) => {
  const today = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const sixMonthProductPromise = Product.find({
    createdAt: {
      $gte: sixMonthsAgo,
      $lte: today,
    },
  }).select("createdAt");

  const sixMonthUsersPromise = User.find({
    createdAt: {
      $gte: sixMonthsAgo,
      $lte: today,
    },
  }).select("createdAt");

  const twelveMonthOrdersPromise = Order.find({
    createdAt: {
      $gte: twelveMonthsAgo,
      $lte: today,
    },
  }).select("createdAt");

  const [products, users, orders] = await Promise.all([
    sixMonthProductPromise,
    sixMonthUsersPromise,
    twelveMonthOrdersPromise,
  ]);

  const productCounts = getChartData({ length: 6, today, docArr: products });
  const usersCounts = getChartData({ length: 6, today, docArr: users });
  const ordersCounts = getChartData({ length: 12, today, docArr: orders });

  return res.status(200).json({
    success: true,
    charts: {
      users: usersCounts,
      products: productCounts,
      orders: ordersCounts,
    },
  });
});

export const getLineCharts = TryCatch(async (req, res, next) => {
  const today = new Date();
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const baseQuery = {
    createdAt: {
      $gte: twelveMonthsAgo,
      $lte: today,
    },
  };

  const [products, users, orders] = await Promise.all([
    Product.find(baseQuery).select("createdAt"),
    User.find(baseQuery).select("createdAt"),
    Order.find(baseQuery).select(["createdAt", "discount", "total"]),
  ]);

  const productCounts = getChartData({ length: 12, today, docArr: products });
  const usersCounts = getChartData({ length: 12, today, docArr: users });
  const discount = getChartData({
    length: 12,
    today,
    docArr: orders,
    property: "discount",
  });
  const revenue = getChartData({
    length: 12,
    today,
    docArr: orders,
    property: "total",
  });

  return res.status(200).json({
    success: true,
    charts: {
      users: usersCounts,
      products: productCounts,
      discount,
      revenue,
    },
  });
});
