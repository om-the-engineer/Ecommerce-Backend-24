import { Request } from "express";
import { TryCatch } from "../middlewares/error.js";
import { Product } from "../models/product.js";
import { Review } from "../models/review.js";
import { User } from "../models/user.js";
import {
  BaseQuery,
  NewProductRequestBody,
  SearchRequestQuery,
  ControllerType,
  NewReviewRequestBody,
} from "../types/types.js";
import {
  deleteFromCloudinary,
  findAverageRatings,
  uploadToCloudinary,
} from "../utils/features.js";
import ErrorHandler from "../utils/utility-class.js";
import mongoose from "mongoose";

export const getlatestProducts = TryCatch(async (req, res, next) => {
  const products = await Product.find({}).sort({ createdAt: -1 }).limit(5);

  return res.status(200).json({
    success: true,
    products,
  });
});

export const getAllCategories = TryCatch(async (req, res, next) => {
  const categories = await Product.distinct("category");

  return res.status(200).json({
    success: true,
    categories,
  });
});

export const getAdminProducts = TryCatch(async (req, res, next) => {
  const products = await Product.find({});

  return res.status(200).json({
    success: true,
    products,
  });
});

export const getSingleProduct = TryCatch(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  return res.status(200).json({
    success: true,
    product,
  });
});

export const getAllProducts = TryCatch(
  async (req: Request<{}, {}, {}, SearchRequestQuery>, res, next) => {
    const { search, sort, category, price } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(process.env.PRODUCT_PER_PAGE) || 8;
    const skip = (page - 1) * limit;

    const baseQuery: BaseQuery = {};

    if (search)
      baseQuery.name = {
        $regex: search,
        $options: "i",
      };

    if (price)
      baseQuery.price = {
        $lte: Number(price),
      };

    if (category) baseQuery.category = category;

    const productsPromise = Product.find(baseQuery)
      .sort(sort && { price: sort === "asc" ? 1 : -1 })
      .limit(limit)
      .skip(skip);

    const [products, filteredOnlyProduct] = await Promise.all([
      productsPromise,
      Product.find(baseQuery),
    ]);

    const totalPage = Math.ceil(filteredOnlyProduct.length / limit);

    return res.status(200).json({
      success: true,
      products,
      totalPage,
    });
  }
);

export const newProduct = TryCatch(
  async (req: Request<{}, {}, NewProductRequestBody>, res, next) => {
    try {
      const { name, price, stock, category, description } = req.body;
      const photos = req.files as Express.Multer.File[];

      if (!process.env.CLOUD_NAME || !process.env.CLOUD_API_KEY || !process.env.CLOUD_API_SECRET) {
        return next(new ErrorHandler("Cloudinary Configuration Missing", 500));
      }

      if (!photos || photos.length === 0) {
        return next(new ErrorHandler("Please add Photos", 400));
      }

      console.log("Attempting to upload to Cloudinary...");
      const photosURL = await uploadToCloudinary(photos);
      console.log("Upload successful:", photosURL);

      await Product.create({
        name,
        price,
        stock,
        category,
        description,
        photos: photosURL,
      });

      return res.status(201).json({
        success: true,
        message: "Product Created Successfully",
      });
    } catch (error: unknown) {
      console.error("Product Creation Error:", error);
      if (error instanceof Error) {
        return next(new ErrorHandler(error.message, 500));
      }
      return next(new ErrorHandler("Internal Server Error", 500));
    }
  }
) as ControllerType<Request<{}, {}, NewProductRequestBody>>;

export const updateProduct = TryCatch(
  async (
    req,
    res,
    next
  ) => {
    const { id } = req.params;
    const { name, price, stock, category, description } = req.body;
    const photos = req.files as Express.Multer.File[] | undefined;

    const product = await Product.findById(id);
    if (!product) return next(new ErrorHandler("Product Not Found", 404));

    if (photos && photos.length > 0) {
      const photosURL = await uploadToCloudinary(photos);
      await deleteFromCloudinary(product.photos.map(photo => photo.public_id));
      product.photos = photosURL;
    }

    if (name) product.name = name;
    if (price) product.price = price;
    if (stock) product.stock = stock;
    if (category) product.category = category;
    if (description) product.description = description;

    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product Updated Successfully",
    });
  }
) as ControllerType<Request<{ id: string }, {}, Partial<NewProductRequestBody>>>;

export const deleteProduct = TryCatch(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  await deleteFromCloudinary(product.photos.map(photo => photo.public_id));
  await product.deleteOne();

  return res.status(200).json({
    success: true,
    message: "Product Deleted Successfully",
  });
}) as ControllerType;

export const allReviewsOfProduct = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const reviews = await Review.find({ product: id }).populate("user", "name");

  return res.status(200).json({
    success: true,
    reviews,
  });
}) as ControllerType;

export const newReview = TryCatch(
  async (
    req: Request,
    res,
    next
  ) => {
    const { rating, comment } = req.body;
    const { id: product } = req.params;
    const { id: user } = req.query;

    const productId = new mongoose.Types.ObjectId(product);

    const review = await Review.create({
      rating,
      comment,
      product: productId,
      user,
    });

    const { ratings, numOfReviews } = await findAverageRatings(productId);

    await Product.findByIdAndUpdate(product, {
      ratings,
      numOfReviews,
    });

    return res.status(201).json({
      success: true,
      message: "Review Added Successfully",
    });
  }
) as ControllerType<Request<{ id: string }, {}, NewReviewRequestBody>>;

export const deleteReview = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const review = await Review.findById(id);
  if (!review) return next(new ErrorHandler("Review Not Found", 404));

  await review.deleteOne();
  const { ratings, numOfReviews } = await findAverageRatings(review.product);

  await Product.findByIdAndUpdate(review.product, {
    ratings,
    numOfReviews,
  });

  return res.status(200).json({
    success: true,
    message: "Review Deleted Successfully",
  });
}) as ControllerType;
