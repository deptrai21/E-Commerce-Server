import express, { NextFunction, Request, Response } from "express";
import {
  BAD_REQUEST_ERROR,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND_ERROR,
  OK_REQUEST,
  UNAUTHORIZED_ERROR,
} from "../helpers/Error";
import { HttpStatusCode } from "../constants/HttpStatusCodes";
import sendEmail from "../helpers/SendMail";
import { auth } from "../middlewares";
import { CategorySchema, UserSchema } from "../validators";
import { transformJoiErrors, transformPrismaErrors } from "../helpers";

import prisma from "../db/prisma";
import { UserRoles } from "../constants/UserRoles";

const Router = express.Router();

// fetch all categories
Router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      includeSubCategories = false,
      take = 10,
      skip = 0,
    } = (req as any).query;

    const categories = await prisma.category.findMany({
      take: parseInt(take),
      skip: parseInt(skip),
      where: {
        parentId:
          includeSubCategories !== "false"
            ? {
                not: null,
              }
            : {
                equals: null,
              },
      },
    });

    return res.status(HttpStatusCode.OK).send(
      new OK_REQUEST("Categories fetched successfully", {
        categories,
      })
    );
  } catch (error) {
    console.log(error);
    next(error);
  }
});

// fetch minimal categories
Router.get(
  "/minimalCategories",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await prisma.category.findMany({
        select: {
          id: true,
          uid: true,
          name: true,
          imageUrl: true,
        },
        where: {
          parentName: null,
        },
      });

      return res.status(HttpStatusCode.OK).send(
        new OK_REQUEST("Minimal categories fetched successfully", {
          categories,
        })
      );
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
);

// fetch subcategories for a category
Router.get(
  "/:categoryName",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { take = 10, skip = 0 } = (req as any).query;
      const { categoryName } = (req as any).params;

      const subCategories = await prisma.category.findMany({
        take: parseInt(take),
        skip: parseInt(skip),
        where: {
          parentName: categoryName,
        },
      });

      return res.status(HttpStatusCode.OK).send(
        new OK_REQUEST("Subcategories fetched successfully", {
          subCategories,
        })
      );
    } catch (error) {
      console.log(error);
      next(error);
    }
  }
);

// create a category
Router.post(
  "/",
  // auth,
  async (req: Request, res: Response, next: NextFunction) => {
    const isSubCategory = req.body.categoryName ? true : false;
    try {
      const isValidSchema = CategorySchema.validate(req.body, {
        stripUnknown: true,
      });

      if (isValidSchema.error) {
        return next(
          new BAD_REQUEST_ERROR(
            "Invalid category data",
            transformJoiErrors(isValidSchema.error)
          )
        );
      }

      const existingCategory = await prisma.category.findFirst({
        where: {
          name: req.body.name,
          parentName: isSubCategory
            ? {
                equals: req.body.categoryName,
              }
            : null,
        },
      });

      if (existingCategory) {
        next(
          new BAD_REQUEST_ERROR(
            `${
              isSubCategory ? "SubCategory" : "Category"
            } with that name already exists`,
            {
              errors: {
                name: "Category with that name already exists",
              },
            }
          )
        );
        return;
      }

      const category = await prisma.category.create({
        data: {
          name: req.body.name,
          description: req.body.description,
          imageUrl: req.body.imageUrl,
          parentName: isSubCategory ? req.body.categoryName : null,
          parent: isSubCategory
            ? {
                connect: {
                  name: req.body.categoryName,
                },
              }
            : undefined,
        },
      });

      return res
        .status(HttpStatusCode.OK)
        .send(
          new OK_REQUEST(
            `${
              isSubCategory ? "SubCategory" : "Category"
            } created successfully`,
            { category }
          )
        );
    } catch (error) {
      const errors = transformPrismaErrors(
        error,
        isSubCategory ? "SubCategory" : "Category"
      );
      next(errors);
    }
  }
);

// edit a category
Router.put(
  "/",
  // auth,
  // checkIfAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uid } = req.body;

      // declaration merging is not working
      // add middleware to check if the role is admin/superadmin
      // const { role } = (req as any).user;

      // if (role === UserRoles.USER) {
      //   throw new UNAUTHORIZED_ERROR("Permission Denied");
      // }

      const category = await prisma.category.update({
        where: {
          uid,
        },
        data: {
          ...req.body,
          // parent:parentObj
        },
      });

      return res.status(HttpStatusCode.OK).send(
        new OK_REQUEST("Category updated successfully", {
          category,
        })
      );
    } catch (error) {
      console.log(error);
      const errors = transformPrismaErrors(error, "Category");

      next({
        ...error,
        payload: { errors },
        httpCode: HttpStatusCode.BAD_REQUEST,
      });
    }
  }
);

export default Router;
